import { ROSTER, DEPARTMENT_BY_ID, BUSINESS_BY_ID } from '../core/config';
import { normalizeEvent, normalizeSnapshot } from '../core/normalize';
import type { Snapshot, ActivityEvent } from '../core/types';
import type { AdapterSink, WorkshopAdapter } from './adapter';
import { decodeFeedReports, diagnostics } from '../core/connections';
import { JournalProjection } from './journal';

export type BridgeMessage = {type:'snapshot'; snapshot:Snapshot} | {type:'events'; events:ActivityEvent[]};
export interface NativeSession {
  sessionId:string; state:'connected'|'unavailable'; workerId:string|null;
  taskState:string; currentStep:string; lastUpdate:number|null; stale:boolean;
  configuredModel:string|null; actualModel:string|null;
}
export interface NativeSessions {
  status:'not_reported'|'connected'|'degraded'; observedAt:number|null; sessions:NativeSession[];
  sessionCount:number; boundRoleCount:number;
}
const emptySessions=():NativeSessions=>({status:'not_reported',observedAt:null,sessions:[],sessionCount:0,boundRoleCount:0});
let sessionValue=emptySessions();
const sessionListeners=new Set<()=>void>();
export const nativeSessions={
  get:()=>sessionValue,
  subscribe:(listener:()=>void)=>{sessionListeners.add(listener);return ()=>{sessionListeners.delete(listener);};},
  update:(next:NativeSessions)=>{sessionValue=next;sessionListeners.forEach(l=>l());},
};
const safeIdentifier=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v)&&!/(?:sk-|AIza|gh[pousr]_|token|secret|password|credential)/i.test(v);
const safeSteps=new Set(['Run a command','Inspect a file','Locate source evidence','Write a file','Apply a source change','Run a bounded procedure','Read operating instructions','Update procedural documentation','Request delegation','Inspect the browser','Inspect visual evidence','Run parallel steps','Invoke a supported tool','Inspect a tool interface','Locate a supported tool','Read reference material','Search reference material','Other runtime tool','Awaiting a recorded runtime step']);
/** Only allowlisted fields survive. Neither prompts nor arbitrary step text is retained. */
export function decodeNativeSessions(raw:unknown,now:number):NativeSessions|null {
  if(!raw||typeof raw!=='object')return null;
  const v=raw as Record<string,any>;
  if(v.version!==2||v.state!=='connected'||!Number.isSafeInteger(v.observedAt)||v.observedAt<0||v.observedAt>now+30000||!Array.isArray(v.sessions)||v.sessions.length>32)return null;
  const ids=new Set<string>();const sessions:NativeSession[]=[];
  for(const s of v.sessions){
    if(!s||!safeIdentifier(s.sessionId)||ids.has(s.sessionId)||!['connected','unavailable'].includes(s.state)||s.workerId!==null&&!ROSTER.some(w=>w.id===s.workerId))return null;
    ids.add(s.sessionId);
    const task=s.task;
    const validTime=Number.isSafeInteger(task?.lastUpdate)&&task.lastUpdate>=0&&task.lastUpdate<=v.observedAt;
    sessions.push({sessionId:s.sessionId,state:s.state,workerId:s.workerId,taskState:['running','waiting','failed','completed','idle','unknown'].includes(task?.state)?task.state:'unknown',currentStep:safeSteps.has(task?.currentStep)?task.currentStep:'Runtime step not reported',lastUpdate:validTime?task.lastUpdate:null,stale:task?.stale!==false||!validTime,configuredModel:safeIdentifier(s.configuredModel)?s.configuredModel:null,actualModel:safeIdentifier(s.actualModel)?s.actualModel:null});
  }
  return {status:'connected',observedAt:v.observedAt,sessions,sessionCount:sessions.filter(s=>s.state==='connected').length,boundRoleCount:new Set(sessions.filter(s=>s.state==='connected'&&s.workerId).map(s=>s.workerId)).size};
}

async function boundedJson(response:Response):Promise<unknown>{
  const limit=262144;
  if(!response.ok||Number(response.headers.get('content-length'))>limit||!response.body)throw Error('Supplemental evidence unavailable');
  const reader=response.body.getReader();const decoder=new TextDecoder();let size=0,text='';
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('Evidence exceeds bound');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}
  finally {void reader.cancel().catch(()=>{});}
}
const known = new Map(ROSTER.map(w => [w.id,w]));
/** Sanitized bridge contract. Arrival time is stamped locally; identities stay canonical. */
export function decodeBridgeMessage(data: string, receivedTs: number): BridgeMessage | null {
  if (data.length > 2_000_000) return null;
  let raw: any;
  try { raw = JSON.parse(data); } catch { return null; }
  if (raw?.type === 'snapshot') {
    const snap = normalizeSnapshot(raw.snapshot);
    if (!snap || snap.takenAt > receivedTs + 30_000 || snap.tasks.length > 120 || snap.attempts.length > 500) return null;
    for (const collection of [snap.workers,snap.tasks,snap.attempts,snap.artifacts,snap.capacity]) if (new Set(collection.map(item => item.id)).size !== collection.length) return null;
    if (new Set(snap.statuses.map(item => item.workerId)).size !== snap.statuses.length) return null;
    if (snap.workers.some(w => { const expected = known.get(w.id); return !expected || expected.businessId !== w.businessId || expected.homeDepartmentId !== w.homeDepartmentId || expected.role !== w.role; })) return null;
    const tasks = new Map(snap.tasks.map(t => [t.id,t]));
    const attempts = new Map(snap.attempts.map(a => [a.id,a]));
    if (snap.tasks.some(t => !BUSINESS_BY_ID[t.businessId] || (t.assignedWorkerId && known.get(t.assignedWorkerId)?.businessId !== t.businessId) || t.attemptIds.some(id => attempts.get(id)?.taskId !== t.id))) return null;
    if (snap.attempts.some(a => !known.has(a.workerId) || tasks.get(a.taskId)?.businessId !== known.get(a.workerId)?.businessId)) return null;
    if (snap.statuses.some(s => !known.has(s.workerId) || DEPARTMENT_BY_ID[s.departmentId]?.businessId !== known.get(s.workerId)?.businessId || (s.taskId && (!tasks.has(s.taskId) || tasks.get(s.taskId)?.businessId !== known.get(s.workerId)?.businessId || (tasks.get(s.taskId)?.assignedWorkerId && tasks.get(s.taskId)?.assignedWorkerId !== s.workerId) || (s.state === 'active' && tasks.get(s.taskId)?.assignedWorkerId !== s.workerId))) || (s.attemptId && (attempts.get(s.attemptId)?.workerId !== s.workerId || attempts.get(s.attemptId)?.taskId !== s.taskId)))) return null;
    return {type:'snapshot',snapshot:{...snap,workers:ROSTER}};
  }
  if (raw?.type === 'events' && Array.isArray(raw.events) && raw.events.length <= 500) {
    const events = raw.events.map((e: unknown) => normalizeEvent({...e as object,receivedTs}));
    if (events.some((e: ActivityEvent | null) => !e || !BUSINESS_BY_ID[e.businessId] || e.sourceTs > receivedTs + 30_000 || (e.workerId && known.get(e.workerId)?.businessId !== e.businessId) || (typeof e.payload.departmentId === 'string' && DEPARTMENT_BY_ID[e.payload.departmentId]?.businessId !== e.businessId))) return null;
    return {type:'events',events:events as ActivityEvent[]};
  }
  return null;
}

/** Explicitly configured, read-only SSE. Reconnects require a fresh snapshot. */
export class LiveBridgeAdapter implements WorkshopAdapter {
  readonly kind = 'live' as const;
  readonly label = 'Live bridge';
  readonly capabilities = {redirect:false,controls:false};
  private stream: EventSource | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ready = false;
  private hadSnapshot = false;
  private journal = new JournalProjection();
  private generation=0;
  private pollController:AbortController|null=null;
  private pollTimeout:ReturnType<typeof setTimeout>|null=null;
  private lastPoll=0;
  constructor(private url: string) {}
  private pollEvidence(generation:number){
    if(this.pollController||generation!==this.generation)return;
    this.lastPoll=Date.now();const controller=new AbortController();this.pollController=controller;
    const current=()=>generation===this.generation&&this.pollController===controller&&!controller.signal.aborted;
    const failed=()=>{if(current())nativeSessions.update({...nativeSessions.get(),status:'degraded'});};
    this.pollTimeout=setTimeout(()=>{if(current()){failed();controller.abort();this.pollController=null;this.pollTimeout=null;}},5000);
    let endpoint:string;
    try {endpoint=new URL('/api/evidence',this.url).href;}catch {failed();controller.abort();this.pollController=null;if(this.pollTimeout)clearTimeout(this.pollTimeout);this.pollTimeout=null;return;}
    void fetch(endpoint,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:controller.signal})
      .then(boundedJson).then(raw=>{
        if(!current())return;
        const body=raw as {reports?:unknown;currentWork?:unknown};
        const reports=decodeFeedReports(body?.reports,Date.now());
        if(!reports)throw Error('Invalid supplemental reports');
        const feeds={...diagnostics.get().feeds};
        for(const report of reports)if(!feeds[report.id]||feeds[report.id]!.checkedAt<=report.checkedAt)feeds[report.id]=report;
        diagnostics.update({feeds});
        const sessions=decodeNativeSessions(body.currentWork,Date.now());
        if(sessions&&(nativeSessions.get().observedAt??0)<=(sessions.observedAt??0))nativeSessions.update(sessions);
        else if(!sessions)failed();
      }).catch(failed).finally(()=>{if(this.pollController===controller){this.pollController=null;if(this.pollTimeout)clearTimeout(this.pollTimeout);this.pollTimeout=null;}});
  }
  start(sink: AdapterSink) {
    this.stop();
    diagnostics.reset();
    sink.connection('reconnecting');
    this.ready = false;
    this.hadSnapshot = false;
    this.journal.reset();
    const generation=this.generation;
    this.stream = new EventSource(this.url, {withCredentials:true});
    this.stream.onmessage = event => {
      if(generation!==this.generation)return;
      const at=Date.now();
      diagnostics.update({lastMessageAt:at});
      let raw: any;
      try { if(event.data.length<=2_000_000) raw=JSON.parse(event.data); } catch { /* validated below */ }
      if(raw?.type==='health') {
        const reports=this.ready ? decodeFeedReports(raw.feeds,at) : null;
        if(reports) {
          diagnostics.update({lastValidAt:at,lastError:null,feeds:{...diagnostics.get().feeds,...Object.fromEntries(reports.map(r=>[r.id,r]))}});
          return;
        }
      }
      const message = decodeBridgeMessage(event.data,at);
      if (!message || (message.type==='events' && !this.ready)) {
        diagnostics.update({rejectedMessages:diagnostics.get().rejectedMessages+1,lastError:'Invalid message or events received before a validated snapshot'});
        this.ready = false; sink.connection('reconnecting'); return;
      }
      if (message.type === 'snapshot') {
        this.ready = true;
        this.hadSnapshot = true;
        diagnostics.update({acceptedSnapshots:diagnostics.get().acceptedSnapshots+1,lastValidAt:at,lastError:null,feeds:{}});
        sink.snapshot(message.snapshot,'connected');
      } else {
        sink.events(message.events);
        diagnostics.update({acceptedEvents:diagnostics.get().acceptedEvents+message.events.length,lastValidAt:at,lastError:null});
      }
    };
    this.stream.onerror = () => { if(generation!==this.generation)return;this.ready = false; diagnostics.update({lastError:'Stream unavailable; a new validated snapshot is required'}); sink.connection(this.hadSnapshot?'reconnecting':'disconnected'); };
    for(const name of ['snapshot','events','heartbeat','current-work']) this.stream.addEventListener?.(name,event=>{
      if(generation!==this.generation)return;
      const at=Date.now();diagnostics.update({lastMessageAt:at});
      try {
        if(name!=='snapshot'&&!this.ready)throw Error('Fresh journal snapshot required');
        const message=this.journal.decode(name,(event as MessageEvent<string>).data,at);
        if(name==='snapshot'||name==='current-work'){
          const frame=JSON.parse((event as MessageEvent<string>).data);
          const sessions=decodeNativeSessions(frame.currentWork,at);
          if(sessions&&(nativeSessions.get().observedAt??0)<=(sessions.observedAt??0))nativeSessions.update(sessions);
        }
        if(message.type==='snapshot') {this.ready=true;this.hadSnapshot=true;diagnostics.update({acceptedSnapshots:diagnostics.get().acceptedSnapshots+1,lastValidAt:at,lastError:null,feeds:{}});sink.snapshot(message.snapshot,'connected');}
        if(message.type==='events'){sink.events(message.events);diagnostics.update({acceptedEvents:diagnostics.get().acceptedEvents+message.events.length,lastValidAt:at,lastError:null});}
        if(message.type==='heartbeat')diagnostics.update({lastValidAt:at,lastError:null});
      } catch {this.ready=false;this.journal.reset();diagnostics.update({rejectedMessages:diagnostics.get().rejectedMessages+1,lastError:'Journal continuity or contract invalid; fresh snapshot required'});sink.connection('reconnecting');}
    });
    sink.tick(Date.now());
    this.pollEvidence(generation);
    this.timer = setInterval(() => {sink.tick(Date.now());if(Date.now()-this.lastPoll>=15000)this.pollEvidence(generation);},1000);
  }
  stop() { this.generation++;this.pollController?.abort();this.pollController=null;if(this.pollTimeout)clearTimeout(this.pollTimeout);this.pollTimeout=null;nativeSessions.update(emptySessions());this.stream?.close(); this.stream = null; if (this.timer) clearInterval(this.timer); this.timer = null; this.ready = false; }
  clock() { return Date.now(); }
  requestRedirect() { return {accepted:false,reason:'This bridge is read-only.'}; }
}

export function configuredBridgeUrl(): string | null {
  const value = import.meta.env.VITE_ARMIS_BRIDGE_URL;
  if (!value) return typeof window!=='undefined' ? new URL('/api/events',window.location.origin).href : null;
  try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
