import type { ActivityEvent, ActivityEventType, Snapshot, TaskStatus, WorkerState } from './types';
const TYPES = new Set<ActivityEventType>(['task.created','task.assigned','task.handoff','task.status','task.ready','attempt.started','attempt.action','attempt.finished','audit.findings','criteria.updated','artifact.recorded','worker.state','worker.heartbeat','capacity.updated','redirect.acknowledged','redirect.applied','redirect.rejected','ledger.updated']);
const WORKER_STATES = new Set<WorkerState>(['active','idle','waiting_provider','waiting_approval','failed','offline','unknown']);
const TASK_STATUSES = new Set<TaskStatus>(['queued','in_progress','waiting_provider','waiting_approval','held','failed','ready','rejected']);
const STAGES = new Set(['unknown','research','creation','audit','fixes','ready','feeds','rules','trader_watch','portfolio','rejected']);
const OUTCOMES = new Set(['handoff','failed_audit','repaired','ready','dispatched','rejected']);
const PROVENANCE = new Set(['provider_reported','locally_measured','estimated','unknown']);
type Obj = Record<string, any>;
const obj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === 'string');
const measured = (v: unknown, valid: (x: any) => boolean) => obj(v) && PROVENANCE.has(v.provenance) && (v.value === null || valid(v.value));
const provider = (v: unknown) => v === undefined || (obj(v) && str(v.provider) && PROVENANCE.has(v.modelProvenance));
const criteria = (v: unknown) => Array.isArray(v) && v.every(x => obj(x) && typeof x.text === 'string' && ['pending','in_progress','met','unmet'].includes(x.state));
const findings = (v: unknown) => Array.isArray(v) && v.every(x => obj(x) && str(x.id) && ['critical','serious','moderate','minor'].includes(x.severity) && typeof x.summary === 'string' && typeof x.resolved === 'boolean');
const artifact = (v: unknown) => obj(v) && str(v.id) && str(v.taskId) && ['markdown','report','diff','log'].includes(v.kind) && typeof v.title === 'string' && typeof v.preview === 'string' && num(v.recordedAt) && typeof v.illustrative === 'boolean';
const capacity = (v: unknown) => obj(v) && str(v.id) && str(v.provider) && obj(v.scope) && ['account','project','organization'].includes(v.scope.kind) && str(v.scope.label) && strings(v.models) && typeof v.modelsIllustrative === 'boolean' && measured(v.availability,x => ['available','limited','unavailable','unknown'].includes(x)) && measured(v.remaining,x => num(x) && x >= 0) && measured(v.resetAt,num) && obj(v.local) && measured(v.local.requests,x => num(x) && x >= 0) && measured(v.local.tokens,x => num(x) && x >= 0) && typeof v.local.windowLabel === 'string' && (v.lastCheckedAt === null || num(v.lastCheckedAt));
const ledger = (v: unknown) => obj(v) && v.paper === true && ['positions','news','traders','sources','venues','equityHistory','operatingCosts','history'].every(k => Array.isArray(v[k])) && obj(v.candidates) && ['startingBankroll','available','reserved','realized','unrealized','drawdownPct','peakEquity','updatedAt'].every(k=>num(v[k]));
function validLedger(v: unknown): boolean {
 if (!ledger(v) || !obj(v)) return false;
 const textFields = (x: unknown, keys: string[]) => obj(x) && keys.every(k => typeof x[k] === 'string');
 const numberFields = (x: unknown, keys: string[]) => obj(x) && keys.every(k => num(x[k]));
 const nullable = (x: unknown) => x === null || num(x);
 if (!v.venues.every((x: unknown) => textFields(x,['id','name','jurisdiction','note']))) return false;
 if (!v.positions.every((x: unknown) => textFields(x,['id','candidateId','contract','venueId','side','recommendation','rationale']) && numberFields(x,['qty','avgPrice','mark','netExitValue']))) return false;
 if (!v.news.every((x: unknown) => textFields(x,['id','headline','source']) && numberFields(x,['publishedAt','observedAt']) && obj(x) && strings(x.contradicts))) return false;
 if (!v.traders.every((x: unknown) => textFields(x,['id','handle','summary','source']) && numberFields(x,['observedAt']))) return false;
 if (!v.sources.every((x: unknown) => textFields(x,['id','label','state']) && obj(x) && nullable(x.lastAt))) return false;
 if (!v.equityHistory.every((x: unknown) => numberFields(x,['at','equity'])) || !v.history.every((x: unknown) => numberFields(x,['at']) && textFields(x,['text']))) return false;
 if (!v.operatingCosts.every((x: unknown) => textFields(x,['label']) && numberFields(x,['amount']) && obj(x) && PROVENANCE.has(x.provenance))) return false;
 return Object.values(v.candidates).every((x: unknown) => {
  if (!obj(x) || !textFields(x,['taskId','question','side','decision']) || !strings(x.newsIds) || !Array.isArray(x.quotes) || (x.estimate !== undefined && !num(x.estimate))) return false;
  return x.quotes.every((q: unknown) => obj(q) && textFields(q,['venueId','contractLabel','ruleCompat','ruleNote']) && ['bid','ask','feePct','depth','quoteAt','netAsk'].every(k=>nullable(q[k])) && (q.bid === null || q.ask !== null) && (q.feePct === null || q.netAsk !== null) && v.venues.some((venue: Obj)=>venue.id === q.venueId));
 });
}

/** Drop malformed inputs before any reducer mutation; only explicit task.ready establishes readiness. */
export function normalizeEvent(raw: unknown): ActivityEvent | null {
 if (!obj(raw) || !str(raw.id) || !TYPES.has(raw.type) || !num(raw.sourceTs) || !num(raw.receivedTs) || !str(raw.businessId) || !obj(raw.payload)) return null;
 const e = raw as ActivityEvent, p = raw.payload;
 if (['workerId','taskId','attemptId','sessionId'].some(k=>raw[k] !== undefined && !str(raw[k]))) return null;
 if (e.type.startsWith('task.') && !str(e.taskId)) return null;
 if (p.provider !== undefined && !provider(p.provider)) return null;
 switch(e.type) {
 case 'worker.state': if (!e.workerId || (p.departmentId !== undefined && !str(p.departmentId))) return null; return {...e,payload:{...p,state:WORKER_STATES.has(p.state)?p.state:'unknown'}};
 case 'worker.heartbeat': if(!e.workerId) return null; break;
 case 'task.status': if (!TASK_STATUSES.has(p.status) || p.status === 'ready') return null; break;
 case 'task.handoff': if ((!STAGES.has(p.from) && p.from !== 'hq') || (!STAGES.has(p.to) && p.to !== 'hq') || (p.outcome !== undefined && !OUTCOMES.has(p.outcome)) || (p.durationMs !== undefined && (!num(p.durationMs) || p.durationMs <= 0))) return null; break;
 case 'task.created': if ((p.stage !== undefined && !STAGES.has(p.stage)) || (p.criteria !== undefined && !strings(p.criteria)) || (p.eligibleCapacity !== undefined && !strings(p.eligibleCapacity)) || (p.maxRepairs !== undefined && (!Number.isSafeInteger(p.maxRepairs) || p.maxRepairs < 0))) return null; break;
 case 'task.assigned': if (!e.workerId || (p.stage !== undefined && !STAGES.has(p.stage))) return null; break;
 case 'attempt.finished': if (!e.attemptId || !['passed','failed','aborted','superseded','completed'].includes(p.outcome)) return null; break;
 case 'audit.findings': if(!e.taskId || !findings(p.findings)) return null; break;
 case 'criteria.updated': if(!e.taskId || !criteria(p.criteria)) return null; break;
 case 'artifact.recorded': if(!artifact(p.artifact)) return null; break;
 case 'capacity.updated': if(!capacity(p.capacity)) return null; break;
 case 'ledger.updated': if(!validLedger(p.book)) return null; break;
 case 'redirect.acknowledged': case 'redirect.applied': case 'redirect.rejected': if(!str(p.redirectId)) return null; break;
 }
 return e;
}

/** Snapshots are atomic: reject malformed collections instead of partially replacing observed state. */
export function normalizeSnapshot(raw: unknown): Snapshot | null {
 if(!obj(raw) || !num(raw.takenAt)) return null;
 if(!['workers','statuses','tasks','attempts','artifacts','capacity'].every(k=>Array.isArray(raw[k]))) return null;
 if(!raw.workers.every((w: Obj)=>obj(w) && str(w.id) && str(w.name) && str(w.businessId) && str(w.role) && str(w.homeDepartmentId) && obj(w.appearance) && ['skin','hair','shirt','pants'].every(k=>str(w.appearance[k])) && ['short','curly','long','bun','mohawk','bald','bob'].includes(w.appearance.hairStyle))) return null;
 if(!raw.statuses.every((s: Obj)=>obj(s) && str(s.workerId) && WORKER_STATES.has(s.state) && str(s.departmentId) && num(s.stateSince) && num(s.lastObservedAt) && provider(s.provider))) return null;
 if(!raw.tasks.every((t: Obj)=>obj(t) && str(t.id) && str(t.businessId) && typeof t.title === 'string' && STAGES.has(t.stage) && TASK_STATUSES.has(t.status) && criteria(t.acceptanceCriteria) && findings(t.findings) && ['attemptIds','artifactIds','eligibleCapacity'].every(k=>strings(t[k])) && ['repairCount','maxRepairs','createdAt','updatedAt'].every(k=>num(t[k])))) return null;
 if(!raw.attempts.every((a: Obj)=>obj(a) && ['id','taskId','workerId'].every(k=>str(a[k])) && (a.sessionId === undefined || str(a.sessionId)) && STAGES.has(a.stage) && num(a.startedAt) && (a.endedAt === undefined || num(a.endedAt)) && (a.outcome === undefined || ['passed','failed','aborted','superseded','completed'].includes(a.outcome)) && provider(a.provider))) return null;
 if(!raw.artifacts.every(artifact) || !raw.capacity.every(capacity)) return null;
 if(raw.timeline !== undefined && (!Array.isArray(raw.timeline) || !raw.timeline.every((t:Obj)=>obj(t) && str(t.eventId) && num(t.at) && TYPES.has(t.type) && str(t.businessId) && typeof t.text === 'string'))) return null;
 if(raw.redirects !== undefined && (!Array.isArray(raw.redirects) || !raw.redirects.every((r:Obj)=>obj(r) && str(r.id) && str(r.workerId) && str(r.taskId) && typeof r.instruction === 'string' && ['requested','acknowledged','applied','rejected'].includes(r.state) && typeof r.simulated === 'boolean' && Array.isArray(r.history) && r.history.every((h:Obj)=>obj(h) && num(h.at) && ['requested','acknowledged','applied','rejected'].includes(h.state))))) return null;
 if(raw.ledger !== undefined && (!obj(raw.ledger) || !Object.values(raw.ledger).every(validLedger))) return null;
 return raw as Snapshot;
}
