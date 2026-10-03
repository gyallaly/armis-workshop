import type {ActivityEvent,Snapshot,WorkerState} from '../../core/types';
import {initialState,reduce} from '../../core/reducer';
import {observedWorker} from './projection';

/** Explicit default-profile/Managing Director binding supplied by the local server.
 * Separate from journal cursors and attempts: ordinary tool steps are not workers.
 */
export function currentWorkEvents(value:unknown):ActivityEvent[]{
 if(!value||typeof value!=='object')return [];
 const v=value as Record<string,any>;
 if(v.state!=='connected')return [];
 const task=v.task;
 const safe=(s:unknown)=>typeof s==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(s);
 if(!safe(v.sessionId)||!task||!safe(task.id)||!Number.isSafeInteger(task.lastUpdate)||task.lastUpdate<0||!Number.isSafeInteger(v.observedAt))throw Error('Invalid native work binding');
 const states:Record<string,WorkerState>={running:'active',waiting:'waiting_approval',blocked:'failed',failed:'failed',completed:'idle',idle:'idle',unknown:'unknown'};
 if(!Object.hasOwn(states,task.state))throw Error('Invalid native work state');
 const at=['unknown','idle','completed'].includes(task.state)?v.observedAt:task.lastUpdate;
 const step=Array.isArray(v.steps)?v.steps.at(-1)?.step:null;
 const action=typeof step==='string'&&/^[A-Za-z -]{1,80}$/.test(step)?step:'Native Hermes runtime progress';
 const base={sourceTs:at,receivedTs:v.observedAt,businessId:'hermes-hq',workerId:'armis.ceo',taskId:task.id,sessionId:v.sessionId};
 const key=`native:${task.id}:${at}:${task.state}`;
 const title='Finish Workshop and Armis setup'; // explicit owner-authorized task, not private prompt text
 return [
  {...base,id:key+':task',type:'task.created',payload:{title,stage:'creation',criteria:[],eligibleCapacity:[],maxRepairs:0}},
  {...base,id:key+':assigned',type:'task.assigned',payload:{stage:'creation'}},
  {...base,id:key+':status',type:'task.status',payload:{status:task.state==='running'?'in_progress':task.state==='waiting'?'waiting_approval':task.state==='failed'||task.state==='blocked'?'failed':'held',reason:task.state==='completed'?'Conversation response completed; independent acceptance not implied':'Observed native runtime state: '+task.state}},
  {...base,id:key+':worker',type:'worker.state',payload:{state:states[task.state],departmentId:observedWorker('armis.ceo').homeDepartmentId,action}},
 ];
}
export function withCurrentWork(snapshot:Snapshot,value:unknown):Snapshot{
 const events=currentWorkEvents(value);if(!events.length)return snapshot;
 const worker=observedWorker('armis.ceo');
 worker.installation={defined:true,installed:true,observed:true,roleBinding:'verified',source:'Explicitly bound default Managing Director session'};
 let state=reduce(initialState([], 'connected',snapshot.takenAt),{kind:'snapshot',snapshot:{...snapshot,workers:[...snapshot.workers.filter(w=>w.id!==worker.id),worker]},connection:'connected'});
 state=reduce(state,{kind:'events',events});
 return {...snapshot,workers:Object.values(state.workers),statuses:Object.values(state.statuses),tasks:Object.values(state.tasks),timeline:state.timeline};
}
