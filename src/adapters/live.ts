import { ROSTER, DEPARTMENT_BY_ID, BUSINESS_BY_ID } from '../core/config';
import { normalizeEvent, normalizeSnapshot } from '../core/normalize';
import type { Snapshot, ActivityEvent } from '../core/types';
import type { AdapterSink, WorkshopAdapter } from './adapter';

export type BridgeMessage = {type:'snapshot'; snapshot:Snapshot} | {type:'events'; events:ActivityEvent[]};
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
  constructor(private url: string) {}
  start(sink: AdapterSink) {
    this.stop();
    sink.connection('reconnecting');
    this.ready = false;
    this.stream = new EventSource(this.url, {withCredentials:true});
    this.stream.onmessage = event => {
      const message = decodeBridgeMessage(event.data,Date.now());
      if (!message) { this.ready = false; sink.connection('reconnecting'); return; }
      if (message.type === 'snapshot') { this.ready = true; sink.snapshot(message.snapshot,'connected'); }
      else if (this.ready) sink.events(message.events);
    };
    this.stream.onerror = () => { this.ready = false; sink.connection('reconnecting'); };
    sink.tick(Date.now());
    this.timer = setInterval(() => sink.tick(Date.now()),1000);
  }
  stop() { this.stream?.close(); this.stream = null; if (this.timer) clearInterval(this.timer); this.timer = null; this.ready = false; }
  clock() { return Date.now(); }
  requestRedirect() { return {accepted:false,reason:'This bridge is read-only.'}; }
}

export function configuredBridgeUrl(): string | null {
  const value = import.meta.env.VITE_ARMIS_BRIDGE_URL;
  if (!value) return null;
  try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
