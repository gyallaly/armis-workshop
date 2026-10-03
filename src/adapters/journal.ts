import { ROSTER, loungeOf } from '../core/config';
import { initialState, reduce } from '../core/reducer';
import type { ActivityEvent, Snapshot, ProviderCapacity, Provenance } from '../core/types';
import { normalizeEvent } from '../core/normalize';
import { diagnostics } from '../core/connections';

const businesses:Record<string,string>={armis:'hermes-hq',uditus:'uditus',etsy:'etsy-studio',aster:'aster-ledger'};
const known=new Map(ROSTER.map(w=>[w.id,w]));
const safeId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v)&&!/(?:\bsk[-_]|gh[pousr]_|github_pat_|AIza|Bearer|password|credential|secret|access[-_:]?token)/i.test(v);
const metric=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function capacity(data:Record<string,any>,type:string,at:number):ProviderCapacity|null {
  if(!safeId(data.capacityPoolId)||!safeId(data.provider))return null;
  const observedAt=metric(data.observedAt)?data.observedAt:at;
  if(observedAt>at+30000)return null;
  const fresh=!metric(data.maxAgeMs)||at-observedAt<=data.maxAgeMs;
  const quota:Provenance=data.quotaProvenance==='observed'?'provider_reported':'unknown';
  const measured=(value:unknown,provenance:Provenance)=>({value:metric(value)&&provenance!=='unknown'?value:null,provenance});
  const unit=data.unit==='requests'||data.unit==='tokens'?data.unit:undefined;
  const remaining=measured(data.remaining,quota),total=measured(data.total,quota);
  if(total.value!==null&&remaining.value!==null&&remaining.value>total.value)return null;
  const availability=!fresh||type==='capacity.unknown'?'unknown':type==='capacity.exhausted'?'unavailable':type==='capacity.limited'?'limited':'available';
  return {id:data.capacityPoolId,provider:data.provider,scope:{kind:['account','project','organization'].includes(data.scopeKind)?data.scopeKind:'unknown',label:safeId(data.scopeLabel)?data.scopeLabel:data.capacityPoolId},models:safeId(data.actualModel)?[data.actualModel]:[],modelsIllustrative:false,availability:{value:availability,provenance:availability==='unknown'?'unknown':'locally_measured',note:'Recorded capacity lifecycle; no provider entitlement inferred'},remaining:{...remaining,unit},resetAt:measured(data.resetAt,quota),local:{requests:measured(data.localRequests,'locally_measured'),tokens:measured(data.localTokens,'locally_measured'),windowLabel:'Source-reported scope counters; period unreported'},lastCheckedAt:observedAt,...(unit&&total.value!==null?{quotaWindows:[{id:`${data.capacityPoolId}:reported`,label:safeId(data.quotaWindowLabel)?data.quotaWindowLabel:'Reported allowance · period unreported',unit,total,remaining,resetAt:measured(data.resetAt,quota),observedAt}]}:{})};
}
/** Named SSE protocol from the installed viewer. Unmatched runtime roles stay unbound. */
export class JournalProjection {
  private epoch:string|null=null;
  private cursor=0;
  decode(name:string,text:string,at:number):{type:'snapshot';snapshot:Snapshot}|{type:'events';events:ActivityEvent[]}|{type:'heartbeat'} {
    if(text.length>2_000_000)throw Error('Journal frame exceeds bound');
    const frame=JSON.parse(text);
    if(frame.version!==1||!safeId(frame.epoch)||!Number.isSafeInteger(frame.cursor)||frame.cursor<0)throw Error('Invalid journal envelope');
    if(name!=='snapshot'&&(this.epoch!==frame.epoch||frame.previousCursor!==undefined&&frame.previousCursor!==this.cursor||name==='heartbeat'&&frame.cursor!==this.cursor))throw Error('Journal epoch or cursor continuity lost');
    if(name==='heartbeat'){const d=diagnostics.get();diagnostics.update({feeds:{...d.feeds,runtime:{id:'runtime',status:'ok',checkedAt:at,lastRecordAt:d.feeds.runtime?.lastRecordAt??null,records:d.observedJournalRecords,detail:'Installed runtime journal reader responds with coherent epoch/cursor. Provider and executor feeds require separate evidence.'}}});return {type:'heartbeat'};}
    if(!['snapshot','events'].includes(name)||!Array.isArray(frame.observations)||frame.observations.length>(name==='snapshot'?10000:500)||name==='snapshot'&&frame.mode!=='live')throw Error('Invalid journal observations');
    if(name==='events'&&(frame.previousCursor!==this.cursor||frame.cursor<this.cursor))throw Error('Journal event cursor gap');
    const events:ActivityEvent[]=[];
    const evidence:ReturnType<typeof diagnostics.get>['journalEvidence']=[];
    let unmapped=0,unbound=0;
    let previous=-1;
    for(const observation of frame.observations){
      if(!observation||observation.version!==1||observation.mode!=='live'||!safeId(observation.eventId)||!safeId(observation.source)||typeof observation.type!=='string'||!Number.isSafeInteger(observation.cursor)||observation.cursor<=previous||observation.cursor>frame.cursor||name==='events'&&observation.cursor<=this.cursor||!Number.isSafeInteger(observation.occurredAt)||observation.occurredAt<0||observation.occurredAt>at+30000||!observation.data||typeof observation.data!=='object'||Array.isArray(observation.data))throw Error('Invalid journal observation');
      previous=observation.cursor;
      const businessId=businesses[observation.businessId??'armis'];
      if(!businessId)throw Error('Unknown journal business');
      const worker=known.get(observation.workerId);
      if(worker&&worker.businessId!==businessId)throw Error('Journal role/company mismatch');
      // armis.auditor/operator and native default sessions are not silently aliased.
      const workerId=worker?.id;
      const taskId=safeId(observation.taskId)?observation.taskId:undefined;
      const base={sourceTs:observation.occurredAt,receivedTs:at,businessId,workerId,taskId,attemptId:safeId(observation.attemptId)?observation.attemptId:undefined,sessionId:safeId(observation.sessionId)?observation.sessionId:undefined};
      const before=events.length;let emitted=0;
      const emit=(type:ActivityEvent['type'],payload:Record<string,unknown>)=>{const event=normalizeEvent({...base,id:`${observation.eventId}:${emitted++}`,type,payload});if(event)events.push(event);};
      const data=observation.data;
      const provider=safeId(data.provider)?{provider:data.provider,model:safeId(data.actualModel)?data.actualModel:undefined,capacityId:safeId(data.capacityPoolId)?data.capacityPoolId:undefined,modelProvenance:(safeId(data.actualModel)?'locally_measured':'unknown') as Provenance}:undefined;
      if(observation.type==='task.queued'&&taskId)emit('task.created',{title:`Observed task · ${taskId}`,stage:'unknown',criteria:[],eligibleCapacity:[],maxRepairs:0});
      if(observation.type==='attempt.started'&&workerId&&taskId&&base.attemptId&&base.sessionId)emit('task.assigned',{stage:'unknown',provider});
      if(observation.type==='task.started'&&taskId)emit('task.status',{status:'in_progress'});
      if(observation.type==='task.claimed'&&taskId)emit('task.status',{status:'queued',reason:'Execution lease claimed; work has not been observed starting'});
      if(['task.held','task.failed','task.waiting','task.completed'].includes(observation.type)&&taskId){
        if(observation.type==='task.completed'&&observation.source==='armis-setup-runtime'&&data.accepted===true)emit('task.ready',{});
        else emit('task.status',{status:observation.type==='task.failed'?'failed':observation.type==='task.waiting'?(data.waitReason==='provider'||data.waitReason==='capacity'?'waiting_provider':'waiting_approval'):'held',reason:observation.type==='task.completed'?'Result recorded; acceptance not exposed by source':'Recorded runtime wait or hold'});
      }
      if(observation.type==='task.waiting'&&workerId)emit('worker.state',{state:data.waitReason==='provider'||data.waitReason==='capacity'?'waiting_provider':'waiting_approval',departmentId:worker!.homeDepartmentId,provider,action:`Waiting: ${['provider','capacity','owner','tool','dependency','local-resource'].includes(data.waitReason)?data.waitReason:'unreported cause'}`});
      if(workerId&&['attempt.activity','worker.idle','worker.offline','heartbeat.lost','source.stale','source.disconnected','attempt.finished','attempt.expired'].includes(observation.type))emit('worker.state',{state:observation.type==='attempt.activity'?'active':observation.type==='worker.idle'?'idle':observation.type==='worker.offline'?'offline':'unknown',departmentId:observation.type==='worker.idle'?loungeOf(businessId):worker!.homeDepartmentId,action:observation.type==='attempt.activity'?'Observed runtime activity':undefined,provider});
      if(observation.type==='attempt.activity'&&workerId)emit('attempt.action',{action:safeId(data.tool)?`Recorded tool: ${data.tool}`:'Recorded runtime activity',tool:safeId(data.tool)?data.tool:undefined,provider});
      if(observation.type==='model.changed'&&workerId&&provider)emit('worker.provider',{provider});
      if(['attempt.finished','attempt.expired'].includes(observation.type)&&base.attemptId&&['completed','failed','passed','aborted','superseded'].includes(data.outcome))emit('attempt.finished',{outcome:data.outcome});
      if(['review.requested','review.failed','review.passed','correction.requested','review.rerequested'].includes(observation.type)&&taskId)emit('task.status',{status:'held',reason:observation.type==='review.passed'?'Review passed; final owner release not exposed by source':observation.type==='review.failed'?'Recorded review failure; findings not exposed by source':observation.type==='correction.requested'?'Recorded correction request':'Recorded review awaiting outcome'});
      if(['capacity.available','capacity.limited','capacity.exhausted','capacity.recovered','capacity.unknown'].includes(observation.type)){const cap=capacity({...data,observedAt:data.observedAt??observation.occurredAt},observation.type,at);if(cap)emit('capacity.updated',{capacity:cap});}
      const unboundRole=observation.workerId!==null&&observation.workerId!==undefined&&!worker;
      if(unboundRole)unbound++;
      if(events.length===before)unmapped++;
      evidence.push({id:observation.eventId,type:safeId(observation.type)?observation.type:'unsupported',source:observation.source,at:observation.occurredAt,role:safeId(observation.workerId)?observation.workerId:undefined,taskId,attemptId:base.attemptId,sessionId:base.sessionId,artifactId:safeId(data.artifactId)?data.artifactId:undefined,reason:unboundRole?'Runtime role has no verified city identity binding':events.length===before?'No compatible city projection; retained as evidence':`Mapped ${events.length-before} city observation(s); remaining fields are not inferred`,inputTokens:metric(data.inputTokens)?data.inputTokens:undefined,outputTokens:metric(data.outputTokens)?data.outputTokens:undefined,costMicros:metric(data.costMicros)?data.costMicros:undefined,costProvenance:['observed','unknown'].includes(data.costProvenance)?data.costProvenance:undefined,model:safeId(data.actualModel)?data.actualModel:undefined});
    }
    this.epoch=frame.epoch;this.cursor=frame.cursor;
    const prior=diagnostics.get();diagnostics.update({observedJournalRecords:(name==='snapshot'?0:prior.observedJournalRecords)+frame.observations.length,unmappedObservations:(name==='snapshot'?0:prior.unmappedObservations)+unmapped,unboundObservations:(name==='snapshot'?0:prior.unboundObservations)+unbound,journalEvidence:[...(name==='snapshot'?[]:prior.journalEvidence),...evidence].slice(-40)});
    if(name==='events')return {type:'events',events};
    let state=initialState(ROSTER,'connected',at);
    state=reduce(state,{kind:'events',events});
    return {type:'snapshot',snapshot:{takenAt:at,workers:ROSTER,statuses:Object.values(state.statuses),tasks:Object.values(state.tasks),attempts:Object.values(state.attempts),artifacts:Object.values(state.artifacts),capacity:Object.values(state.capacity),timeline:state.timeline}};
  }
  reset(){this.epoch=null;this.cursor=0;}
}
