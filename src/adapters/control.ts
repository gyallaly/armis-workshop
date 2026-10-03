import { normalizeEvent, normalizeSnapshot } from '../core/normalize';
import type { ActivityEvent, Snapshot, Task } from '../core/types';

export { CONTROL_BUSINESS_IDS, CONTROL_REGISTRY_REF, ORGANIZATION_ROLES } from '../core/organization';
export type { ControlRole, ControlRoleKind } from '../core/organization';
import { CONTROL_BUSINESS_IDS } from '../core/organization';

export interface ControlTaskRow {id:string; spec:string; state:string; route:string|null; held_reason:string|null}
export interface ControlSnapshot {version:1; control:{id:number;stopped:number}; tasks:ControlTaskRow[]; budgets:Record<string,unknown>[]; pools:Record<string,unknown>[]}
export interface ControlEventRow {seq:number; at:number; type:string; task:string|null; body:string}
export interface ControlProjection {
 snapshot:Snapshot;
 /** Control rows retained without asserting viewer capacity provenance or inventing sessions. */
 control:{stopped:boolean; budgets:Record<string,unknown>[]; pools:Record<string,unknown>[]};
}
/** Match the viewer's task bound and Control's ordered export batch size. */
export const CONTROL_IMPORT_LIMITS = { tasks:120, events:500 } as const;
const object = (x:unknown): x is Record<string,any> => !!x && typeof x === 'object' && !Array.isArray(x);
function json(text:unknown): Record<string,any>|null {try {const v=typeof text === 'string' ? JSON.parse(text) : null; return object(v)?v:null;} catch{return null;}}
const taskState:Record<string,Task['status']>={queued:'queued',running:'in_progress',ready:'ready',held:'held',cancelled:'rejected'};
/** Pure read-only import. Control has no roster, stage, evidence history, or owner allocation in this export. */
export function projectControlSnapshot(raw:unknown,takenAt:number):ControlProjection|null {
 if(!object(raw) || raw.version !== 1 || !Number.isFinite(takenAt) || !object(raw.control) || ![0,1].includes(raw.control.stopped) || !Array.isArray(raw.tasks) || raw.tasks.length > CONTROL_IMPORT_LIMITS.tasks || !Array.isArray(raw.budgets) || !raw.budgets.every(object) || !Array.isArray(raw.pools) || !raw.pools.every(object)) return null;
 const tasks:Task[]=[];
 for(const row of raw.tasks) {
  if(!object(row) || typeof row.id !== 'string' || !row.id || !taskState[row.state]) return null;
  const spec=json(row.spec), businessId=spec && CONTROL_BUSINESS_IDS[spec.business];
  if(!spec || !businessId || typeof spec.family !== 'string' || !Number.isSafeInteger(spec.maxAttempts) || spec.maxAttempts < 1) return null;
  // Control exports no department stage: do not place work in an invented room.
  const stage = row.state === 'ready' ? 'ready' : row.state === 'cancelled' ? 'rejected' : 'unknown';
  tasks.push({id:row.id,businessId,title:`${spec.family} · ${row.id}`,stage,status:taskState[row.state]!,acceptanceCriteria:[],attemptIds:[],findings:[],artifactIds:[],repairCount:0,maxRepairs:0,unreportedFields:['department stage','acceptance criteria','repair policy','creation timestamp','attempt/session identity'],eligibleCapacity:[],heldReason:typeof row.held_reason === 'string' ? row.held_reason : undefined,createdAt:takenAt,updatedAt:takenAt});
 }
 const snapshot=normalizeSnapshot({takenAt,workers:[],statuses:[],tasks,attempts:[],artifacts:[],capacity:[]});
 return snapshot ? {snapshot,control:{stopped:raw.control.stopped === 1,budgets:raw.budgets,pools:raw.pools}} : null;
}
/** Events require task context because several Control rows omit business and the export omits worker/session IDs. */
export function projectControlEvent(raw:unknown,tasks:Record<string,Task>,receivedTs:number):ActivityEvent|null {
 if(!object(raw) || !Number.isSafeInteger(raw.seq) || raw.seq < 1 || !Number.isFinite(raw.at) || !Number.isFinite(receivedTs) || typeof raw.task !== 'string') return null;
 const task=tasks[raw.task], body=json(raw.body);
 if(!task || !body) return null;
 if(body.business !== undefined && CONTROL_BUSINESS_IDS[body.business] !== task.businessId) return null;
 const base={id:`control:${raw.seq}`,sourceTs:raw.at,receivedTs,businessId:task.businessId,taskId:task.id};
 let type:ActivityEvent['type'],payload:Record<string,unknown>;
 switch(raw.type) {
 case 'task.queued': type='task.status'; payload={status:'queued'}; break;
 case 'attempt.started': type='task.status'; payload={status:'in_progress'}; break;
 case 'attempt.finished':
  if(body.state !== 'ready' && body.state !== 'held') return null;
  type=body.state === 'ready' ? 'task.ready' : 'task.status'; payload=body.state === 'ready' ? {} : {status:'held',reason:'Control requires review, model verification, or stop reconciliation'}; break;
 case 'attempt.expired': type='task.status'; payload={status:'held',reason:'Expired; process/effects must be reconciled'}; break;
 case 'task.reconciled':
  if(body.action !== 'retry' && body.action !== 'cancel') return null;
  type='task.status'; payload={status:body.action === 'retry'?'queued':'rejected',reason:body.reason}; break;
 default:return null;
 }
 return normalizeEvent({...base,type,payload});
}
