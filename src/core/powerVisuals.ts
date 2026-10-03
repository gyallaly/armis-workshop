import type { ProviderCapacity, WorkshopState } from './types';

export interface PowerPolicy { lifecycle: 'running'|'draining'|'stopping'|'stopped'|'unknown'; weight: number; maxConcurrent: number }
export function effectivePowerPolicies(control:{source:'demo'|'live';companies:Record<string,PowerPolicy>;capabilities:{companyControl:boolean};receipts:{type:string;state:string}[]}):Record<string,PowerPolicy> {
  const pending=control.receipts.some(r=>r.state==='acknowledged'&&['allocation.set','company.resume','global.resume'].includes(r.type));
  if(control.source==='demo'||control.capabilities.companyControl&&!pending) return control.companies;
  return Object.fromEntries(Object.keys(control.companies).map(id=>[id,{lifecycle:'unknown',weight:0,maxConcurrent:0}]));
}
export type ReactorState = 'available'|'warning'|'fault'|'unknown';
export function reactorQuota(capacity:ProviderCapacity,state:Pick<WorkshopState,'connection'|'now'>):number|null {
  if(!['demo','connected'].includes(state.connection)||!capacity.quotaWindows?.length) return null;
  const ratios=capacity.quotaWindows.map(w=>w.total.value!==null&&w.total.value>0&&w.remaining.value!==null&&w.remaining.value>=0&&w.remaining.value<=w.total.value&&w.observedAt<=state.now+30_000&&state.now-w.observedAt<=90_000?w.remaining.value/w.total.value:null);
  return ratios.some(r=>r===null)?null:Math.min(...ratios as number[]);
}
/** A count without a total is not a percentage. Freshness applies to every lamp. */
export function reactorState(capacity: ProviderCapacity, state: Pick<WorkshopState,'connection'|'now'>): ReactorState {
  if (!['demo','connected'].includes(state.connection) || capacity.lastCheckedAt === null || state.now-capacity.lastCheckedAt > 90_000 || capacity.lastCheckedAt>state.now+30_000) return 'unknown';
  if (capacity.availability.value === 'unknown' || capacity.availability.value === null) return 'unknown';
  const quota=reactorQuota(capacity,state);
  if (capacity.availability.value === 'unavailable' || capacity.remaining.value === 0 || quota===0) return 'fault';
  if (capacity.availability.value === 'limited' || (quota!==null&&quota<=.2)) return 'warning';
  return 'available';
}
export function pipeWidth(policy: PowerPolicy | undefined): number {
  if(!policy || policy.lifecycle==='unknown') return 1;
  if(policy.lifecycle==='stopped' || policy.lifecycle==='stopping') return 1;
  return 2 + Math.sqrt(Math.max(0,Math.min(100,policy.weight)) / 100)*5;
}
