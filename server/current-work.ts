import {DatabaseSync} from 'node:sqlite';

interface Scope {chatId:string;threadId:string}
type ExecutionState='running'|'waiting'|'failed'|'completed'|'idle'|'unknown';
const STEPS:Record<string,string>={terminal:'Run a command',read_file:'Inspect a file',search_files:'Locate source evidence',write_file:'Write a file',patch:'Apply a source change',execute_code:'Run a bounded procedure',skill_view:'Read operating instructions',skill_manage:'Update procedural documentation',delegate_task:'Request delegation',browser_exec:'Inspect the browser',vision_analyze:'Inspect visual evidence',parallel:'Run parallel steps',tool_call:'Invoke a supported tool',tool_describe:'Inspect a tool interface',hermes_tool_search:'Locate a supported tool',web_extract:'Read reference material',web_search:'Search reference material',run:'Read reference material'};
const safeId=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,119}$/.test(v)&&!/(?:\bsk-|AIza|gh[pousr]_|secret|password|token)/i.test(v)?v:null;
const millis=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?Math.round(v*1000):null;
/** Read-only native SessionDB projection, scoped to one explicitly authorized Slack thread.
 * Prompts, arguments, outputs, reasoning, titles and free-form activity labels never leave SQLite.
 * A conversation turn and its tool steps are not independent worker assignments or acceptance.
 */
export class CurrentWork{
 private db:DatabaseSync;private scope:Scope;
 constructor(path:string,scope:Scope){
  if(!safeId(scope.chatId)||!safeId(scope.threadId))throw Error('Explicit thread binding required');
  this.scope=scope;this.db=new DatabaseSync(path,{readOnly:true});
 }
 read(now=Date.now()){
  this.db.exec('BEGIN');
  try{
   const session=this.db.prepare(`SELECT id,started_at,ended_at,model,last_activity_at,last_activity_provenance FROM sessions
    WHERE source='slack' AND chat_id=? AND thread_id=? AND profile_name='default' ORDER BY started_at DESC LIMIT 1`).get(this.scope.chatId,this.scope.threadId);
   if(!session||typeof session.id!=='string'||!safeId(session.id))throw Error('Authorized default-profile session unavailable');
   const turn=this.db.prepare("SELECT id,timestamp FROM messages WHERE session_id=? AND role='user' AND active=1 ORDER BY id DESC LIMIT 1").get(session.id);
   if(!turn||typeof turn.id!=='number'||!Number.isSafeInteger(turn.id))throw Error('No observed user turn');
   const sessionId=session.id,turnId=turn.id;
   const rows=this.db.prepare(`SELECT m.id,m.timestamp,CAST(j.key AS INTEGER) ordinal,
      json_extract(j.value,'$.id') callId,COALESCE(json_extract(j.value,'$.function.name'),json_extract(j.value,'$.name')) tool
     FROM messages m JOIN json_each(CASE WHEN json_valid(m.tool_calls) AND length(m.tool_calls)<=1048576 THEN m.tool_calls ELSE '[]' END) j
     WHERE m.session_id=? AND m.role='assistant' AND m.active=1 AND m.id>? ORDER BY m.id,ordinal LIMIT 501`).all(session.id,turn.id);
   if(rows.length>500)throw Error('Observed turn exceeds progress bound');
   const steps=rows.map(row=>{
    const callId=safeId(row.callId);if(!callId)throw Error('Unsupported step identity');
    const result=this.db.prepare(`SELECT id,timestamp,
      CASE WHEN json_valid(content) THEN
       CASE WHEN (json_extract(content,'$.exit_code') IS NOT NULL AND json_extract(content,'$.exit_code')<>0)
        OR json_extract(content,'$.status')='error'
        OR (json_type(content,'$.error') IS NOT NULL AND json_type(content,'$.error')<>'null' AND json_extract(content,'$.error')<>'') THEN 1 ELSE 0 END
       ELSE NULL END failed
      FROM messages WHERE session_id=? AND role='tool' AND active=1 AND id>? AND tool_call_id=? ORDER BY id DESC LIMIT 1`).get(sessionId,turnId,callId);
    const tool=typeof row.tool==='string'?row.tool.replace(/^(functions|multi_tool_use|web)\./,''):'';
    const lastUpdate=millis(result?.timestamp??row.timestamp);if(lastUpdate===null)throw Error('Invalid source timestamp');
    const state:ExecutionState=result?(result.failed===1?'failed':'completed'):now-lastUpdate<120000&&now>=lastUpdate?'running':'unknown';
    return {id:callId,step:STEPS[tool]??'Other runtime tool',state,startedAt:millis(row.timestamp),lastUpdate,basis:result?'Tool returned; not worker acceptance':'Tool request observed; process completion unobserved'};
   });
   if(new Set(steps.map(s=>s.id)).size!==steps.length)throw Error('Duplicate tool identities');
   const last=this.db.prepare("SELECT id,role,timestamp,finish_reason,CASE WHEN tool_calls IS NULL OR tool_calls='[]' THEN 0 ELSE 1 END hasTools FROM messages WHERE session_id=? AND active=1 AND id>? ORDER BY id DESC LIMIT 1").get(session.id,turn.id);
   const activity=millis(session.last_activity_at),lastUpdate=Math.max(millis(turn.timestamp)??0,millis(last?.timestamp)??0,activity??0);
   const stale=now-lastUpdate>120000||now<lastUpdate;
   let state:ExecutionState=steps.some(s=>s.state==='running')?'running':steps.at(-1)?.state==='failed'?'failed':steps.some(s=>s.state==='unknown')?'unknown':'idle';
   let basis=state==='idle'?'No outstanding tool request in the bound session; model generation is not observed':state==='failed'?'Most recent tool returned a failure; no new execution observed':'Outstanding request completion is unknown';
   if(state==='running')basis='An ordinary Hermes tool request is in progress; it is not another worker';
   if(last?.role==='assistant'&&last.finish_reason==='stop'&&last.hasTools===0&&!steps.some(s=>s.state==='running')){state='completed';basis='Assistant response recorded; delegation/review acceptance is not implied';}
   if(activity!==null&&activity>=(millis(turn.timestamp)??Infinity)){
    if(session.last_activity_provenance==='agent.compression'){state='waiting';basis='Runtime reports context compression';}
    else if(session.last_activity_provenance==='agent.compression_timeout'){state='failed';basis='Runtime reports context compression timeout';}
    else if(['agent.compression_cooldown','agent.compression_turnhold'].includes(String(session.last_activity_provenance))){state='waiting';basis='Runtime reports a context-processing hold';}
   }
   if(stale&&state!=='completed'&&state!=='idle'){state='unknown';basis='Last observed progress is stale; current execution is unknown';}
   const taskId=`${session.id}:turn:${turn.id}`;
   this.db.exec('COMMIT');
   return {state:'connected' as const,source:'native Hermes SessionDB',sessionId:String(session.id),observedAt:now,
    task:{id:taskId,title:'Finish Workshop and Armis setup',responsibleAgent:'armis.ceo',currentStep:steps.at(-1)?.step??'Awaiting a recorded runtime step',state,lastUpdate,stale:state==='idle'?false:stale,basis,stateObservedAt:Math.floor(now/15000)*15000},
    configuredModel:safeId(session.model),actualModel:null,workerCount:1,independentAcceptance:'not observed',steps,
    limitation:'This observes only the explicitly bound Slack thread. Tool steps are not workers. A returned tool or assistant response does not prove delegation or independent review. Private output is withheld.'};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 close(){this.db.close();}
}
