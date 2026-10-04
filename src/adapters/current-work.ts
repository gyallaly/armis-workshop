import {ROSTER} from '../core/config';
import {normalizeEvent} from '../core/normalize';
import type {ActivityEvent,WorkerState} from '../core/types';
const safe=(s:unknown)=>typeof s==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(s)&&!['__proto__','prototype','constructor'].includes(s);
/** Explicit role bindings only; unbound sessions remain source evidence, not city agents. */
export function currentWorkEvents(value:unknown):ActivityEvent[]{
 if(!value||typeof value!=='object')return [];
 const v=value as Record<string,any>;if(v.state!=='connected')return [];
 if(v.version!==undefined&&v.version!==1&&v.version!==2)throw Error('Unsupported native work version');
 if(v.version===2){
  if(!Array.isArray(v.sessions)||v.sessions.length>32||!Number.isSafeInteger(v.observedAt)||v.observedAt<0)throw Error('Invalid native sessions');
  const ids=new Set<string>(),selected=new Map<string,Record<string,any>>();
  for(const session of v.sessions){
   if(!session||!safe(session.sessionId)||ids.has(session.sessionId)||!['connected','unavailable'].includes(session.state))throw Error('Invalid native session');
   ids.add(session.sessionId);
   if(session.enrollment!==undefined){
    const e=session.enrollment;
    if(!e||!['actorId','jobId','attemptId','evidenceId'].every(k=>safe(e[k]))||!['owner-attested','dispatcher','setup-runtime'].includes(e.provenance)||!Number.isSafeInteger(e.enrolledAt)||e.enrolledAt<0||!Number.isSafeInteger(e.expiresAt)||e.expiresAt<=e.enrolledAt||e.expiresAt-e.enrolledAt>86400000||e.revokedAt!==null&&(!Number.isSafeInteger(e.revokedAt)||e.revokedAt<e.enrolledAt))throw Error('Invalid enrollment evidence');
    const status=e.revokedAt!==null?'revoked':v.observedAt<e.enrolledAt?'not-yet-current':v.observedAt>=e.expiresAt?'expired':'current';
    if(e.status!==status||session.state==='connected'&&status!=='current')throw Error('Noncurrent enrollment cannot report connected activity');
   }
   if(session.workerId===null)continue;
   if(!safe(session.workerId)||!ROSTER.some(w=>w.id===session.workerId))throw Error('Unknown native role binding');
   if(session.state==='connected'){
    if(session.observedAt!==v.observedAt||session.task?.responsibleAgent!==session.workerId)throw Error('Native binding mismatch');
    // Validate every bound session, even one that will not win role occupancy.
    project(session,session.workerId);
   }
   const prior=selected.get(session.workerId);
   const score=(s:Record<string,any>)=>s.state==='connected'&&s.task?.state==='running'&&!s.task.stale?2:s.state==='connected'?1:0;
   if(!prior||score(session)>score(prior)||score(session)===score(prior)&&(session.task?.lastUpdate??0)>(prior.task?.lastUpdate??0))selected.set(session.workerId,session);
  }
  return [...selected.values()].flatMap(session=>session.state==='connected'?project(session,session.workerId):[
   normalizeEvent({id:`native:${session.sessionId}:unavailable:${v.observedAt}`,type:'worker.state',sourceTs:v.observedAt,receivedTs:v.observedAt,businessId:ROSTER.find(w=>w.id===session.workerId)!.businessId,workerId:session.workerId,sessionId:session.sessionId,payload:{state:'unknown',action:'Bound session unavailable'}})!
  ]);
 }
 // Legacy Slack transport was explicitly bound to the director on the server.
 return project(v,'armis.ceo');
}
function project(v:Record<string,any>,workerId:string):ActivityEvent[]{
 const task=v.task;
 if(!safe(v.sessionId)||!task||!safe(task.id)||!Number.isSafeInteger(task.lastUpdate)||task.lastUpdate<0||!Number.isSafeInteger(v.observedAt)||v.observedAt<0||task.lastUpdate>v.observedAt)throw Error('Invalid native binding');
 const states:Record<string,WorkerState>={running:'active',waiting:'unknown',failed:'failed',completed:'idle',idle:'unknown',unknown:'unknown'};
 if(!Object.hasOwn(states,task.state))throw Error('Invalid native state');
 if(task.state==='running'&&(task.stale===true||v.observedAt-task.lastUpdate>=120000))throw Error('Stale native activity cannot be active');
 const at=['unknown','idle','completed'].includes(task.state)?v.observedAt:task.lastUpdate;
 if(at>v.observedAt+30000)throw Error('Invalid native clock');
 const director=ROSTER.find(w=>w.id===workerId)!;
 const step=Array.isArray(v.steps)?v.steps.at(-1)?.step:null;
 const action=typeof step==='string'&&/^[A-Za-z -]{1,80}$/.test(step)?step:'Native Hermes runtime progress';
 const base={sourceTs:at,receivedTs:v.observedAt,businessId:director.businessId,workerId:director.id,taskId:task.id,sessionId:v.sessionId};
 const key=`native:${task.id}:${at}:${task.state}`;
 return [
  {...base,id:key+':task',type:'task.created',payload:{title:'Bound Hermes conversation progress',stage:'unknown',criteria:[],eligibleCapacity:[],maxRepairs:0}},
  {...base,id:key+':assigned',type:'task.assigned',payload:{stage:'unknown'}},
  {...base,id:key+':status',type:'task.status',payload:{status:task.state==='running'?'in_progress':task.state==='failed'?'failed':'held',reason:'Observed conversation progress; independent acceptance not implied'}},
  {...base,id:key+':worker',type:'worker.state',payload:{state:states[task.state],departmentId:director.homeDepartmentId,action}},
 ].map(e=>normalizeEvent(e)).filter((e):e is ActivityEvent=>e!==null);
}
