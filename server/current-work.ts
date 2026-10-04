import {DatabaseSync} from 'node:sqlite';
import {readEnrollment} from '../scripts/session-enrollment.mjs';

export interface SlackWorkScope {chatId:string;threadId:string}
/** Server-owned allowlist. Omitted workerId means observed session, NOT a declared role.
 * Parent passes {sessionIds:[...],bindings:[{sessionId,workerId}]} to CurrentWork.
 * CLI and oneshot sources are supported; no discovery or descendant auto-enrollment. */
export interface SessionWorkScope {sessionIds:string[];bindings?:{sessionId:string;workerId:string}[]}
/** Opt-in durable host attestations; legacy constructor forms remain unchanged.
 * Root and DB path are operator-selected, not taken from journal text or requests. */
export interface EnrollmentWorkScope {enrollmentPath:string;enrollmentRoot:string}
interface EnrollmentRecord {sessionId:string;actorId:string;jobId:string;attemptId:string;workerId:string|null;source:string;provenance:string;evidenceId:string;enrolledAt:number;expiresAt:number;revokedAt:number|null}
type Scope=SlackWorkScope|SessionWorkScope|EnrollmentWorkScope;
type ExecutionState='running'|'waiting'|'failed'|'completed'|'idle'|'unknown';
const STEPS:Record<string,string>={terminal:'Run a command',read_file:'Inspect a file',search_files:'Locate source evidence',write_file:'Write a file',patch:'Apply a source change',execute_code:'Run a bounded procedure',skill_view:'Read operating instructions',skill_manage:'Update procedural documentation',delegate_task:'Request delegation',browser_exec:'Inspect the browser',vision_analyze:'Inspect visual evidence',parallel:'Run parallel steps',tool_call:'Invoke a supported tool',tool_describe:'Inspect a tool interface',hermes_tool_search:'Locate a supported tool',web_extract:'Read reference material',web_search:'Search reference material',run:'Read reference material'};
const safeId=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v)&&!/(?:\bsk-|AIza|gh[pousr]_|secret|password|token)/i.test(v)?v:null;
const millis=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?Math.round(v*1000):null;
/** Read-only native SessionDB projection, scoped to one explicitly authorized Slack thread.
 * Prompts, arguments, outputs, reasoning, titles and free-form activity labels never leave SQLite.
 * A conversation turn and its tool steps are not independent worker assignments or acceptance.
 */
export class CurrentWork{
 private db:DatabaseSync;private scope:Scope;private hasEndReason:boolean;private databasePath:string;
 constructor(path:string,scope:Scope){
  this.databasePath=path;
  if('enrollmentPath' in scope){
   readEnrollment(scope.enrollmentPath,scope.enrollmentRoot,path);
   this.scope={enrollmentPath:scope.enrollmentPath,enrollmentRoot:scope.enrollmentRoot};
  }else if('sessionIds' in scope){
   if(!Array.isArray(scope.sessionIds)||scope.sessionIds.length<1||scope.sessionIds.length>32||scope.sessionIds.some(id=>!safeId(id))||new Set(scope.sessionIds).size!==scope.sessionIds.length)throw Error('Explicit bounded session allowlist required');
   const bindings=scope.bindings??[];
   if(!Array.isArray(bindings)||bindings.length>32||bindings.some(b=>!scope.sessionIds.includes(b.sessionId)||!safeId(b.workerId))||new Set(bindings.map(b=>b.sessionId)).size!==bindings.length)throw Error('Invalid explicit role binding');
   this.scope={sessionIds:[...scope.sessionIds],bindings:bindings.map(b=>({...b}))};
  }else{
   if(!safeId(scope.chatId)||!safeId(scope.threadId))throw Error('Explicit thread binding required');
   this.scope={...scope};
  }
  this.db=new DatabaseSync(path,{readOnly:true});
  try{this.hasEndReason=this.db.prepare('PRAGMA table_info(sessions)').all().some(r=>r.name==='end_reason');}catch(e){this.db.close();throw e;}
 }
 read(now=Date.now()){
  if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid observation clock');
  this.db.exec('BEGIN');
  try{
   if('sessionIds' in this.scope||'enrollmentPath' in this.scope){
    const enrolled:EnrollmentRecord[]|null='enrollmentPath' in this.scope?readEnrollment(this.scope.enrollmentPath,this.scope.enrollmentRoot,this.databasePath).records:null;
    const scope:SessionWorkScope=enrolled?{sessionIds:enrolled.map(r=>r.sessionId),bindings:enrolled.filter(r=>r.workerId!==null).map(r=>({sessionId:r.sessionId,workerId:r.workerId!}))}:this.scope as SessionWorkScope;
    const sessions=scope.sessionIds.map(sessionId=>{
     const workerId=scope.bindings?.find(b=>b.sessionId===sessionId)?.workerId??null;
     const record=enrolled?.find(r=>r.sessionId===sessionId);
     const status=record?(record.revokedAt!==null?'revoked':now<record.enrolledAt?'not-yet-current':now>=record.expiresAt?'expired':'current'):null;
     const enrollment=record?{status,actorId:record.actorId,jobId:record.jobId,attemptId:record.attemptId,provenance:record.provenance,evidenceId:record.evidenceId,enrolledAt:record.enrolledAt,expiresAt:record.expiresAt,revokedAt:record.revokedAt}:undefined;
     try{
      if(status&&status!=='current')throw Error('Enrollment not current');
      const session=this.db.prepare(`SELECT id,source,started_at,ended_at,${this.hasEndReason?'end_reason':'NULL end_reason'},model,last_activity_at,last_activity_provenance FROM sessions WHERE id=? AND source IN ('cli','oneshot') AND profile_name='default'`).get(sessionId);
      if(!session||record&&session.source!==record.source)throw Error('Unavailable binding');
      return {...this.project(session,now,workerId),workerId,...(enrollment?{enrollment}:{})};
     }catch{return {state:'unavailable' as const,sessionId,workerId,observedAt:now,...(enrollment?{enrollment}:{}),gap:'Explicit session unavailable, unsupported or enrollment not current; execution unknown'};}
    });
    this.db.exec('COMMIT');
    return {version:2 as const,state:'connected' as const,source:'native Hermes SessionDB',observedAt:now,sessions,sessionCount:sessions.filter(s=>s.state==='connected').length,boundRoleCount:new Set(sessions.filter(s=>s.state==='connected'&&s.workerId).map(s=>s.workerId)).size,independentAcceptance:'not observed',limitation:'Only explicitly scoped default-profile CLI/oneshot sessions. Durable enrollment is a trusted host attestation, not independent runtime acceptance. Legacy allowlists remain supported; no source label assigns a role.'};
   }
   const session=this.db.prepare(`SELECT id,source,started_at,ended_at,${this.hasEndReason?'end_reason':'NULL end_reason'},model,last_activity_at,last_activity_provenance FROM sessions
    WHERE source='slack' AND chat_id=? AND thread_id=? AND profile_name='default' ORDER BY started_at DESC LIMIT 1`).get(this.scope.chatId,this.scope.threadId);
   if(!session||typeof session.id!=='string'||!safeId(session.id))throw Error('Authorized default-profile session unavailable');
   const value=this.project(session,now,'armis.ceo');
   this.db.exec('COMMIT');return value;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 private project(session:Record<string,any>,now:number,workerId:string|null){
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
   const activity=millis(session.last_activity_at),endedAt=millis(session.ended_at),lastUpdate=Math.max(millis(turn.timestamp)??0,millis(last?.timestamp)??0,activity??0,endedAt??0);
   const stale=now-lastUpdate>=120000||now<lastUpdate;
   let state:ExecutionState=steps.some(s=>s.state==='running')?'running':steps.at(-1)?.state==='failed'?'failed':steps.some(s=>s.state==='unknown')?'unknown':'idle';
   let basis=state==='idle'?'No outstanding tool request in the bound session; model generation is not observed':state==='failed'?'Most recent tool returned a failure; no new execution observed':'Outstanding request completion is unknown';
   if(state==='running')basis='An ordinary Hermes tool request is in progress; it is not another worker';
   if(last?.role==='assistant'&&last.finish_reason==='stop'&&last.hasTools===0&&!steps.some(s=>s.state==='running'||s.state==='unknown')){state='completed';basis='Assistant response recorded; delegation/review acceptance is not implied';}
   if(['error','agent_error','content_filter'].includes(String(last?.finish_reason))){state='failed';basis='Runtime records an error finish; no acceptance implied';}
   if(activity!==null&&activity>=(millis(last?.timestamp??turn.timestamp)??Infinity)&&endedAt===null){
    if(session.last_activity_provenance==='agent.compression'){state='waiting';basis='Runtime reports context compression';}
    else if(session.last_activity_provenance==='agent.compression_timeout'){state='failed';basis='Runtime reports context compression timeout';}
    else if(['agent.compression_cooldown','agent.compression_turnhold'].includes(String(session.last_activity_provenance))){state='waiting';basis='Runtime reports a context-processing hold';}
   }
   if(endedAt!==null&&state!=='completed'&&state!=='failed'){state='unknown';basis='Session ended without an observed completed response; outcome and acceptance unknown';}
   if(endedAt!==null&&['error','agent_error'].includes(String(session.end_reason))){state='failed';basis='Runtime records session termination with error; no acceptance implied';}
   if(stale&&state!=='completed'){state='unknown';basis='Last observed progress is stale; current execution is unknown';}
   const taskId=`${session.id}:turn:${turn.id}`;
   return {state:'connected' as const,source:'native Hermes SessionDB',sessionId:String(session.id),observedAt:now,
    sessionSource:session.source,lifecycle:endedAt===null?'open':'ended',endedAt,
    task:{id:taskId,title:'Bound Hermes conversation progress',responsibleAgent:workerId,currentStep:steps.at(-1)?.step??'Awaiting a recorded runtime step',state,lastUpdate,stale,basis,stateObservedAt:Math.floor(now/15000)*15000},
    configuredModel:safeId(session.model),actualModel:null,workerCount:workerId===null?0:1,independentAcceptance:'not observed',steps,
    limitation:'This observes only an explicitly authorized session. Tool steps are not workers. A returned tool or assistant response does not prove delegation or independent review. Private output is withheld.'};
 }
 close(){this.db.close();}
}
