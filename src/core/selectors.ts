import { BUSINESS_BY_ID, DEPARTMENT_BY_ID, departmentForStage } from './config';
import type { Millis, Task, Worker, WorkerState, WorkerStatus, WorkshopState } from './types';

/** A worker not heard from for this long is shown as stale, not as working. */
export const STALE_AFTER_MS = 90_000;

export interface DisplayStatus {
  /** What to show. Stale / disconnected data collapses to "unknown". */
  state: WorkerState;
  /** The last state actually reported (may differ from `state`). */
  reported: WorkerState | null;
  stale: boolean;
  departmentId: string;
  status?: WorkerStatus;
}

/**
 * The one place that decides how a worker is presented. The scene, the panel
 * and the task list all go through here so they can never disagree.
 */
export function displayStatus(state: WorkshopState, worker: Worker): DisplayStatus {
  const st = state.statuses[worker.id];
  if (!st) return { state: 'unknown', reported: null, stale: true, departmentId: worker.homeDepartmentId };
  const disconnected = state.connection === 'disconnected' || state.connection === 'reconnecting';
  const tooOld = state.now - st.lastObservedAt > STALE_AFTER_MS;
  const stale = disconnected || (tooOld && st.state !== 'offline');
  return {
    state: stale ? 'unknown' : st.state,
    reported: st.state,
    stale,
    departmentId: st.departmentId,
    status: st,
  };
}

export interface Counts {
  /** Workers observed actively working right now. */
  active: number;
  /** Persistent identities belonging here (not processes). */
  roster: number;
  /** Workers whose last observed location is here. */
  present: number;
  queued: number;
  waitingProvider: number;
  held: number;
  failed: number;
  inProgress: number;
  ready: number;
  idle: number;
  offline: number;
  unknown: number;
}

const ZERO: Counts = {
  active: 0,
  roster: 0,
  present: 0,
  queued: 0,
  waitingProvider: 0,
  held: 0,
  failed: 0,
  inProgress: 0,
  ready: 0,
  idle: 0,
  offline: 0,
  unknown: 0,
};

function tallyTask(c: Counts, t: Task) {
  switch (t.status) {
    case 'queued':
      c.queued++;
      break;
    case 'waiting_provider':
      c.waitingProvider++;
      break;
    case 'held':
    case 'waiting_approval':
      c.held++;
      break;
    case 'failed':
      c.failed++;
      break;
    case 'in_progress':
      c.inProgress++;
      break;
    case 'ready':
      c.ready++;
      break;
  }
}

function tallyWorker(c: Counts, d: DisplayStatus) {
  if (d.state === 'active') c.active++;
  else if (d.state === 'idle') c.idle++;
  else if (d.state === 'offline') c.offline++;
  else if (d.state === 'unknown') c.unknown++;
}

export function businessCounts(state: WorkshopState, businessId: string): Counts {
  const c = { ...ZERO };
  for (const w of Object.values(state.workers)) {
    if (w.businessId !== businessId) continue;
    c.roster++;
    tallyWorker(c, displayStatus(state, w));
  }
  for (const t of Object.values(state.tasks)) if (t.businessId === businessId) tallyTask(c, t);
  return c;
}

export function departmentCounts(state: WorkshopState, departmentId: string): Counts {
  const c = { ...ZERO };
  const dept = DEPARTMENT_BY_ID[departmentId];
  if (!dept) return c;
  for (const w of Object.values(state.workers)) {
    if (w.businessId !== dept.businessId) continue;
    const d = displayStatus(state, w);
    if (w.homeDepartmentId === departmentId) c.roster++;
    if (d.departmentId === departmentId) {
      c.present++;
      tallyWorker(c, d);
    }
  }
  for (const t of Object.values(state.tasks)) {
    if (t.businessId !== dept.businessId) continue;
    if (departmentForStage(t.businessId, t.stage) === departmentId) tallyTask(c, t);
  }
  return c;
}

export function campusCounts(state: WorkshopState): Counts {
  const c = { ...ZERO };
  for (const id of Object.keys(BUSINESS_BY_ID)) {
    const b = businessCounts(state, id);
    for (const k of Object.keys(c) as (keyof Counts)[]) c[k] += b[k];
  }
  return c;
}

export function workersIn(state: WorkshopState, businessId: string): Worker[] {
  return Object.values(state.workers)
    .filter((w) => w.businessId === businessId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function tasksSorted(state: WorkshopState): Task[] {
  const order: Record<string, number> = {
    in_progress: 0,
    waiting_provider: 1,
    waiting_approval: 2,
    held: 3,
    failed: 4,
    queued: 5,
    ready: 6,
  };
  return Object.values(state.tasks).sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.updatedAt - a.updatedAt);
}

export function elapsed(now: Millis, since: Millis | undefined): string {
  if (since === undefined) return '-';
  const s = Math.max(0, Math.round((now - since) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** Which workers draw on a capacity scope right now (shared, not per-worker). */
export function capacityConsumers(state: WorkshopState, capacityId: string): Worker[] {
  return Object.values(state.statuses)
    .filter((s) => s.provider?.capacityId === capacityId && (s.state === 'active' || s.state === 'waiting_provider'))
    .map((s) => state.workers[s.workerId])
    .filter((w): w is Worker => Boolean(w));
}

export function tasksWaitingOn(state: WorkshopState, capacityId: string): Task[] {
  return Object.values(state.tasks).filter((t) => t.status === 'waiting_provider' && t.eligibleCapacity.includes(capacityId));
}

/**
 * True only when capacity is known and every provider scope reports
 * unavailable. Unknown capacity never counts as "out".
 */
export function capacityOut(state: WorkshopState): boolean {
  const caps = Object.values(state.capacity);
  return caps.length > 0 && caps.every((c) => c.availability.value === 'unavailable');
}
