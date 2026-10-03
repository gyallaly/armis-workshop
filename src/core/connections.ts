/** Mac feed health is explicit evidence, independent of simulated city state. */
export const FEEDS = [
  ['runtime','Hermes runtime','Sessions and worker service health'],
  ['organization','Agent organization','Role IDs, companies and reporting lines'],
  ['workers','Agent status','Work, rest, waits, failures and heartbeats'],
  ['sessions','Execution sessions','Session and attempt identities, starts and finishes'],
  ['jobs','Jobs and queues','Assignments, stages, blockers and job state'],
  ['progress','Acceptance progress','Recorded criteria and outcomes'],
  ['handoffs','Delegation and handoffs','Recorded transfers between agents or departments'],
  ['tools','Tool activity','Sanitized actions and tool names'],
  ['quality','Audits and repairs','Findings, severity, resolution and repair limits'],
  ['artifacts','Deliverables','Reports, diffs, logs and evidence'],
  ['capacity','Provider capacity','Availability, allowance, resets and shared scopes'],
  ['usage','Measured AI usage','Requests, tokens, latency and retries'],
  ['budgets','Costs and budgets','Measured/estimated spend and reservations'],
  ['machine','Mac resources','CPU, memory, swap, disk and uptime'],
  ['scheduler','Scheduler and leases','Admission, dependencies, expiry and recovery'],
  ['locks','Resource locks','Workspace, profile and browser ownership'],
  ['integrations','Company integrations','Database, email, commerce and provider checks'],
  ['schedules','Scheduled work','Next run, last result and overdue work'],
  ['approvals','Approvals and stop controls','Pending decisions and stop-switch state'],
  ['results','Business results','Verified company outputs and outcomes'],
  ['deployment','Deployment state','Running versions, migration state and deployment time'],
  ['incidents','Incidents','Failures, affected services and recovery'],
  ['ledger','Aster paper ledger','Paper positions, candidates, costs and source freshness'],
] as const;
export type FeedId = typeof FEEDS[number][0];
export interface FeedReport {
  id: FeedId;
  status: 'ok' | 'error' | 'not_configured';
  checkedAt: number;
  lastRecordAt: number | null;
  records: number;
  detail: string;
}
export interface Diagnostics {
  observedJournalRecords: number;
  unmappedObservations: number;
  unboundObservations: number;
  journalEvidence: {id:string;type:string;source:string;at:number;role?:string;taskId?:string;attemptId?:string;sessionId?:string;artifactId?:string;reason:string;inputTokens?:number;outputTokens?:number;costMicros?:number;costProvenance?:string;model?:string}[];
  acceptedSnapshots: number;
  acceptedEvents: number;
  rejectedMessages: number;
  lastMessageAt: number | null;
  lastValidAt: number | null;
  lastError: string | null;
  feeds: Partial<Record<FeedId,FeedReport>>;
}
const empty = (): Diagnostics => ({observedJournalRecords:0,unmappedObservations:0,unboundObservations:0,journalEvidence:[],acceptedSnapshots:0,acceptedEvents:0,rejectedMessages:0,lastMessageAt:null,lastValidAt:null,lastError:null,feeds:{}});
let value = empty();
const listeners = new Set<()=>void>();
export const diagnostics = {
  get:()=>value,
  subscribe:(listener:()=>void)=> {listeners.add(listener);return ()=>{listeners.delete(listener);};},
  reset:()=>{value=empty();listeners.forEach(l=>l());},
  update:(patch:Partial<Diagnostics>)=>{value={...value,...patch};listeners.forEach(l=>l());},
};
export function decodeFeedReports(raw: unknown, now: number): FeedReport[] | null {
  if(!Array.isArray(raw) || raw.length>FEEDS.length) return null;
  const ids=new Set<string>();
  for(const r of raw) {
    if(!r || !FEEDS.some(f=>f[0]===r.id) || ids.has(r.id) || !['ok','error','not_configured'].includes(r.status) || !Number.isFinite(r.checkedAt) || r.checkedAt<0 || r.checkedAt>now+30000 || (r.lastRecordAt!==null && (!Number.isFinite(r.lastRecordAt) || r.lastRecordAt<0 || r.lastRecordAt>r.checkedAt)) || !Number.isSafeInteger(r.records) || r.records<0 || typeof r.detail!=='string' || r.detail.length>500) return null;
    ids.add(r.id);
  }
  return raw;
}
export function feedWorking(report:FeedReport|undefined, live:boolean, now:number) {
  return live && report?.status==='ok' && now-report.checkedAt<=45000 && now-report.checkedAt>=-30000;
}
