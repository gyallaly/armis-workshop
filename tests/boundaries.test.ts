import { describe, it, expect } from 'vitest';
import { normalizeEvent, normalizeSnapshot } from '../src/core/normalize';
import { initialState, applyEvent, applySnapshot, reduce } from '../src/core/reducer';
import { capacityConsumers, STALE_AFTER_MS } from '../src/core/selectors';
import { ROSTER } from '../src/core/config';
import { DemoSim } from '../src/adapters/demo/sim';
import { ORGANIZATION_ROLES, CONTROL_BUSINESS_IDS, projectControlSnapshot, projectControlEvent } from '../src/adapters/control';
import type { ActivityEvent } from '../src/core/types';
const event = (type:ActivityEvent['type'],payload:Record<string,unknown>,extra:Partial<ActivityEvent>={}):ActivityEvent => ({id:`${type}:${JSON.stringify(payload)}`,type,sourceTs:1000,receivedTs:1001,businessId:'uditus',taskId:'task',payload,...extra});

describe('adapter boundaries',()=>{
 it('only explicit ready events can mark a task ready',()=>{
  const s=applyEvent(initialState(),event('task.created',{title:'Work'}));
  expect(applyEvent(s,event('task.status',{status:'ready'}))).toBe(s);
  expect(applyEvent(s,event('task.ready',{}, {sourceTs:1002})).tasks.task!.status).toBe('ready');
 });
 it('drops invalid handoff destinations, outcomes, durations without changing state',()=>{
  const s=applyEvent(initialState(),event('task.created',{}));
  for(const p of [{from:'research',to:'moon'}, {from:'research',to:'audit',outcome:'explode'}, {from:'research',to:'audit',durationMs:-1}, {from:'research',to:'audit',durationMs:NaN}]) expect(applyEvent(s,event('task.handoff',p))).toBe(s);
 });
 it('rejects malformed nested collections and provider capacity',()=>{
  expect(normalizeEvent(event('audit.findings',{findings:{}}))).toBeNull();
  expect(normalizeEvent(event('criteria.updated',{criteria:[{text:'x',state:'random'}]}))).toBeNull();
  expect(normalizeEvent(event('task.created',{criteria:'x'}))).toBeNull();
  expect(normalizeEvent(event('capacity.updated',{capacity:{id:'x',availability:{},remaining:{},resetAt:{},local:{}}}))).toBeNull();
 });
 it('accepts valid demo snapshots and atomically rejects malformed snapshots',()=>{
  const snap=new DemoSim(7,'steady').snapshot();
  expect(normalizeSnapshot(snap)).not.toBeNull();
  const s=initialState();
  expect(applySnapshot(s,{...snap,capacity:[{id:'bad'} as any]},'connected')).toBe(s);
  expect(applySnapshot(s,{...snap,tasks:[{id:'bad'} as any]},'connected')).toBe(s);
  expect(normalizeSnapshot({...snap,statuses:null})).toBeNull();
  const brokenBook = new DemoSim(7,'steady').snapshot().ledger!['aster-ledger']!;
  expect(normalizeSnapshot({...snap,ledger:{'aster-ledger':{...brokenBook,positions:[{id:'bad'}]}}})).toBeNull();
 });
 it('capacity consumers share stale and connection semantics with worker presentation',()=>{
  const worker=ROSTER[0]!;
  let s=applyEvent(initialState(ROSTER,'connected',1000),event('worker.state',{state:'active',provider:{provider:'test',capacityId:'cap',modelProvenance:'unknown'}},{workerId:worker.id}));
  expect(capacityConsumers(s,'cap').map(w=>w.id)).toEqual([worker.id]);
  expect(capacityConsumers({...s,connection:'reconnecting'},'cap')).toEqual([]);
  s=reduce(s,{kind:'tick',now:1000+STALE_AFTER_MS+1});
  expect(capacityConsumers(s,'cap')).toEqual([]);
 });
});
const control = {version:1,control:{id:1,stopped:0},tasks:[{id:'job',spec:JSON.stringify({business:'aster',family:'research',maxAttempts:3}),state:'running',route:'r',held_reason:null}],budgets:[],pools:[]};
describe('Control projection',()=>{
 it('maps real business IDs and imports tasks without inventing observed agents',()=>{
  expect(CONTROL_BUSINESS_IDS.armis).toBe('hermes-hq');
  const p=projectControlSnapshot(control,1000)!;
  expect(p.snapshot.tasks[0]).toMatchObject({businessId:'aster-ledger',status:'in_progress',stage:'unknown',maxRepairs:0,unreportedFields:['department stage','acceptance criteria','repair policy','creation timestamp','attempt/session identity']});
  expect(p.snapshot.workers).toEqual([]); expect(p.snapshot.statuses).toEqual([]); expect(p.snapshot.capacity).toEqual([]);
 });
 it('keeps every declared role reporting to an existing role and exposes no fabricated owner allocations',()=>{
  expect(ORGANIZATION_ROLES).toHaveLength(29);
  const ids=new Set(ORGANIZATION_ROLES.map(r=>r.id));
  for(const r of ORGANIZATION_ROLES) if(r.reportsTo) expect(ids.has(r.reportsTo)).toBe(true);
  expect(ORGANIZATION_ROLES.find(r=>r.id==='etsy.reviewer')?.reportsTo).toBe('etsy.quality');
 });
 it('maps finish to explicit ready and expiry/reconciliation to held or rejected',()=>{
  const task=projectControlSnapshot(control,1000)!.snapshot.tasks[0]!, tasks={[task.id]:task};
  const row=(type:string,body:object)=>({seq:1,at:1001,type,task:'job',body:JSON.stringify(body)});
  expect(projectControlEvent(row('attempt.finished',{state:'ready'}),tasks,1002)?.type).toBe('task.ready');
  expect(projectControlEvent(row('attempt.expired',{}),tasks,1002)?.payload).toMatchObject({status:'held'});
  expect(projectControlEvent(row('task.reconciled',{action:'cancel',reason:'Evidence checked'}),tasks,1002)?.payload).toMatchObject({status:'rejected'});
  expect(projectControlEvent(row('attempt.started',{business:'etsy'}),tasks,1002)).toBeNull();
  expect(projectControlEvent(row('control.changed',{}),tasks,1002)).toBeNull();
 });
 it('rejects unsupported versions, business IDs and broken JSON',()=>{
  expect(projectControlSnapshot({...control,version:2},1000)).toBeNull();
  expect(projectControlSnapshot({...control,tasks:Array.from({length:121},()=>control.tasks[0])},1000)).toBeNull();
  expect(projectControlSnapshot({...control,tasks:[{...control.tasks[0],spec:'bad'}]},1000)).toBeNull();
  expect(projectControlSnapshot({...control,tasks:[{...control.tasks[0],spec:JSON.stringify({business:'unknown',family:'x',maxAttempts:1})}]},1000)).toBeNull();
 });
});
