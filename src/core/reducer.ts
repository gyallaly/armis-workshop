import { departmentForStage, loungeOf } from './config';
import { normalizeEvent } from './normalize';
import type {
  ActivityEvent,
  Artifact,
  Attempt,
  AttemptOutcome,
  AuditFinding,
  ConnectionState,
  CriterionState,
  Millis,
  ProviderCapacity,
  ProviderRef,
  RedirectRequest,
  RedirectState,
  Snapshot,
  Task,
  TaskStage,
  TaskStatus,
  TimelineEntry,
  TrafficDot,
  Worker,
  WorkerState,
  WorkerStatus,
  WorkshopState,
} from './types';

/** History bounds - the viewer must run on an 8 GB Mac mini for days. */
export const LIMITS = {
  timeline: 300,
  taskTimeline: 40,
  seenIds: 2000,
  traffic: 60,
  redirects: 50,
  tasks: 120,
} as const;

export type Action =
  | { kind: 'reset'; roster: Worker[]; connection: ConnectionState; now: Millis }
  | { kind: 'snapshot'; snapshot: Snapshot; connection: ConnectionState }
  | { kind: 'event'; event: ActivityEvent }
  | { kind: 'events'; events: ActivityEvent[] }
  | { kind: 'tick'; now: Millis }
  | { kind: 'connection'; connection: ConnectionState }
  | { kind: 'redirect.request'; request: RedirectRequest };

export function initialState(roster: Worker[] = [], connection: ConnectionState = 'disconnected', now: Millis = 0): WorkshopState {
  return {
    connection,
    now,
    lastEventAt: null,
    workers: Object.fromEntries(roster.map((w) => [w.id, w])),
    statuses: {},
    tasks: {},
    attempts: {},
    artifacts: {},
    capacity: {},
    redirects: {},
    traffic: [],
    timeline: [],
    taskTimeline: {},
    seenIds: [],
    seenSet: new Set(),
    entityClock: {},
    ledger: {},
    stats: { applied: 0, duplicates: 0, outOfOrder: 0 },
  };
}

export function reduce(state: WorkshopState, action: Action): WorkshopState {
  switch (action.kind) {
    case 'reset':
      return initialState(action.roster, action.connection, action.now);
    case 'snapshot':
      return applySnapshot(state, action.snapshot, action.connection);
    case 'event':
      return applyEvent(state, action.event);
    case 'events':
      return action.events.reduce(applyEvent, state);
    case 'tick':
      return tick(state, action.now);
    case 'connection':
      return state.connection === action.connection ? state : { ...state, connection: action.connection };
    case 'redirect.request':
      return putRedirect(state, action.request);
  }
}

function tick(state: WorkshopState, now: Millis): WorkshopState {
  const traffic = state.traffic.filter((d) => now <= d.startedAt + d.durationMs + 1500);
  return pruneTasks({ ...state, now, traffic: traffic.length === state.traffic.length ? state.traffic : traffic });
}

/** Keeps memory bounded: drops the oldest finished (ready) tasks and their records. */
export function pruneTasks(state: WorkshopState, max: number = LIMITS.tasks): WorkshopState {
  const all = Object.values(state.tasks);
  if (all.length <= max) return state;
  const drop = all
    .filter((t) => t.status === 'ready' || t.status === 'rejected')
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, all.length - max);
  if (!drop.length) return state;
  const tasks = { ...state.tasks };
  const attempts = { ...state.attempts };
  const artifacts = { ...state.artifacts };
  const taskTimeline = { ...state.taskTimeline };
  for (const t of drop) {
    delete tasks[t.id];
    delete taskTimeline[t.id];
    for (const a of t.attemptIds) delete attempts[a];
    for (const a of t.artifactIds) delete artifacts[a];
  }
  return { ...state, tasks, attempts, artifacts, taskTimeline };
}

/**
 * A snapshot replaces observed entity state wholesale (it is the source's view
 * of "now"). Roster identity is merged, never dropped: a worker missing from a
 * snapshot keeps its name and look but loses any status (=> unknown).
 */
export function applySnapshot(state: WorkshopState, snap: Snapshot, connection: ConnectionState): WorkshopState {
  // An older snapshot must not roll newer observed state back.
  if (state.lastEventAt !== null && snap.takenAt < state.lastEventAt) return { ...state, connection };
  const workers = { ...state.workers };
  for (const w of snap.workers) workers[w.id] = w;
  const entityClock: Record<string, Millis> = {};
  const statuses = Object.fromEntries(snap.statuses.map((s) => [s.workerId, s]));
  for (const s of snap.statuses) entityClock[`worker:${s.workerId}`] = s.lastObservedAt;
  const tasks = Object.fromEntries(snap.tasks.map((t) => [t.id, t]));
  for (const t of snap.tasks) entityClock[`task:${t.id}`] = t.updatedAt;
  const capacity = Object.fromEntries(snap.capacity.map((c) => [c.id, c]));
  for (const c of snap.capacity) entityClock[`capacity:${c.id}`] = c.lastCheckedAt ?? snap.takenAt;
  for (const id of Object.keys(snap.ledger ?? {})) entityClock[`ledger:${id}`] = snap.takenAt;
  const timeline = snap.timeline ? mergeTimeline(state.timeline, snap.timeline) : state.timeline;
  const taskTimeline = { ...state.taskTimeline };
  if (snap.timeline) {
    for (const e of snap.timeline) {
      if (!e.taskId) continue;
      taskTimeline[e.taskId] = mergeTimeline(taskTimeline[e.taskId] ?? [], [e], LIMITS.taskTimeline);
    }
  }
  const redirects = { ...state.redirects };
  for (const r of snap.redirects ?? []) redirects[r.id] = mergeRedirect(redirects[r.id], r);
  boundRedirects(redirects);
  for (const e of snap.timeline ?? []) remember(state, e.eventId);
  return {
    ...state,
    connection,
    now: Math.max(state.now, snap.takenAt),
    lastEventAt: snap.takenAt,
    workers,
    statuses,
    tasks,
    attempts: Object.fromEntries(snap.attempts.map((a) => [a.id, a])),
    artifacts: Object.fromEntries(snap.artifacts.map((a) => [a.id, a])),
    capacity,
    redirects,
    timeline,
    taskTimeline,
    entityClock,
    ledger: snap.ledger ? { ...state.ledger, ...snap.ledger } : state.ledger,
  };
}

function mergeRedirect(prev: RedirectRequest | undefined, next: RedirectRequest): RedirectRequest {
  if (!prev) return next;
  const seen = new Set<string>();
  const history = [...prev.history, ...next.history]
    .sort((a, b) => a.at - b.at)
    .filter((h) => (seen.has(h.state) ? false : (seen.add(h.state), true)));
  return { ...prev, ...next, instruction: next.instruction || prev.instruction, history };
}

function boundRedirects(r: Record<string, RedirectRequest>) {
  const keys = Object.keys(r);
  for (let i = 0; i < keys.length - LIMITS.redirects; i++) delete r[keys[i]!];
}

function mergeTimeline(a: TimelineEntry[], b: TimelineEntry[], limit: number = LIMITS.timeline): TimelineEntry[] {
  const byId = new Map<string, TimelineEntry>();
  for (const e of a) byId.set(e.eventId, e);
  for (const e of b) byId.set(e.eventId, e);
  const merged = [...byId.values()].sort((x, y) => x.at - y.at || (x.eventId < y.eventId ? -1 : 1));
  return merged.length > limit ? merged.slice(merged.length - limit) : merged;
}

function remember(state: WorkshopState, id: string) {
  // The seen-id ring is an index, not observable state, so it is updated in
  // place to avoid copying a 2000-entry Set on every event.
  if (state.seenSet.has(id)) return;
  state.seenSet.add(id);
  state.seenIds.push(id);
  while (state.seenIds.length > LIMITS.seenIds) {
    const old = state.seenIds.shift();
    if (old !== undefined) state.seenSet.delete(old);
  }
}

/** Returns true when the event is at least as new as what we hold for `key`. */
function isFresh(clock: Record<string, Millis>, key: string, ts: Millis): boolean {
  const prev = clock[key];
  return prev === undefined || ts >= prev;
}

export function applyEvent(state: WorkshopState, raw: ActivityEvent): WorkshopState {
  const e = normalizeEvent(raw);
  if (!e) return state; // malformed: dropped at the boundary, never half-applied
  if (state.seenSet.has(e.id)) {
    return { ...state, stats: { ...state.stats, duplicates: state.stats.duplicates + 1 } };
  }
  remember(state, e.id);

  const s: WorkshopState = {
    ...state,
    lastEventAt: Math.max(state.lastEventAt ?? 0, e.sourceTs),
    stats: { ...state.stats, applied: state.stats.applied + 1 },
  };
  const clock = (s.entityClock = { ...state.entityClock });
  let outOfOrder = false;

  // Any event about a worker counts as an observation of that worker.
  if (e.workerId && s.statuses[e.workerId]) {
    const st = s.statuses[e.workerId]!;
    if (e.sourceTs > st.lastObservedAt) s.statuses = { ...s.statuses, [e.workerId]: { ...st, lastObservedAt: e.sourceTs } };
  }

  const p = e.payload as Record<string, any>;

  switch (e.type) {
    case 'task.created': {
      if (!e.taskId || s.tasks[e.taskId]) break;
      const stage = (p.stage as TaskStage) ?? 'research';
      const task: Task = {
        id: e.taskId,
        businessId: e.businessId,
        title: String(p.title ?? 'Untitled task'),
        acceptanceCriteria: ((p.criteria as string[]) ?? []).map((text) => ({ text, state: 'pending' as const })),
        stage,
        status: 'queued',
        attemptIds: [],
        findings: [],
        artifactIds: [],
        repairCount: 0,
        maxRepairs: Number(p.maxRepairs ?? 2),
        eligibleCapacity: (p.eligibleCapacity as string[]) ?? [],
        createdAt: e.sourceTs,
        updatedAt: e.sourceTs,
      };
      s.tasks = { ...s.tasks, [task.id]: task };
      clock[`task:${task.id}`] = e.sourceTs;
      break;
    }
    case 'task.assigned': {
      const task = e.taskId ? s.tasks[e.taskId] : undefined;
      if (!task || !e.workerId) break;
      const attemptId = e.attemptId ?? `${e.id}:attempt`;
      if (!s.attempts[attemptId]) {
        const attempt: Attempt = {
          id: attemptId,
          taskId: task.id,
          workerId: e.workerId,
          sessionId: e.sessionId ?? 'unknown-session',
          stage: (p.stage as TaskStage) ?? task.stage,
          startedAt: e.sourceTs,
          provider: p.provider as ProviderRef | undefined,
        };
        s.attempts = { ...s.attempts, [attemptId]: attempt };
      }
      if (isFresh(clock, `task:${task.id}`, e.sourceTs)) {
        clock[`task:${task.id}`] = e.sourceTs;
        const attemptIds = task.attemptIds.includes(attemptId) ? task.attemptIds : [...task.attemptIds, attemptId];
        s.tasks = {
          ...s.tasks,
          [task.id]: { ...task, assignedWorkerId: e.workerId, status: 'in_progress', attemptIds, updatedAt: e.sourceTs, heldReason: undefined },
        };
      } else outOfOrder = true;
      break;
    }
    case 'task.handoff': {
      const task = e.taskId ? s.tasks[e.taskId] : undefined;
      if (!task) break;
      const from = p.from as TaskStage | 'hq';
      const to = p.to as TaskStage | 'hq';
      const outcome = (p.outcome as TrafficDot['outcome']) ?? 'handoff';
      const dot: TrafficDot = {
        id: e.id,
        taskId: task.id,
        businessId: e.businessId,
        from,
        to,
        outcome,
        startedAt: e.sourceTs,
        durationMs: Number(p.durationMs ?? 6000),
        label: task.title,
      };
      s.traffic = [...s.traffic, dot].slice(-LIMITS.traffic);
      if (isFresh(clock, `task:${task.id}`, e.sourceTs)) {
        clock[`task:${task.id}`] = e.sourceTs;
        if (to !== 'hq') {
          s.tasks = {
            ...s.tasks,
            [task.id]: {
              ...task,
              stage: to,
              // A handoff to "ready" is not readiness: only an explicit task.ready is.
              status: to === 'ready' || to === 'rejected' ? task.status : 'queued',
              assignedWorkerId: undefined,
              repairCount: outcome === 'repaired' ? task.repairCount + 1 : task.repairCount,
              updatedAt: e.sourceTs,
            },
          };
        }
      } else outOfOrder = true;
      break;
    }
    case 'task.status': {
      const task = e.taskId ? s.tasks[e.taskId] : undefined;
      if (!task) break;
      if (isFresh(clock, `task:${task.id}`, e.sourceTs)) {
        clock[`task:${task.id}`] = e.sourceTs;
        const status = p.status as TaskStatus;
        const releases = status === 'queued' || status === 'held' || status === 'failed' || status === 'rejected';
        s.tasks = {
          ...s.tasks,
          [task.id]: {
            ...task,
            status,
            heldReason: status === 'held' || status === 'waiting_approval' || status === 'failed' || status === 'rejected' ? (p.reason as string) : undefined,
            assignedWorkerId: releases ? undefined : task.assignedWorkerId,
            updatedAt: e.sourceTs,
          },
        };
      } else outOfOrder = true;
      break;
    }
    case 'task.ready': {
      const task = e.taskId ? s.tasks[e.taskId] : undefined;
      if (!task) break;
      if (isFresh(clock, `task:${task.id}`, e.sourceTs)) {
        clock[`task:${task.id}`] = e.sourceTs;
        s.tasks = { ...s.tasks, [task.id]: { ...task, stage: 'ready', status: 'ready', assignedWorkerId: undefined, updatedAt: e.sourceTs } };
      } else outOfOrder = true;
      break;
    }
    case 'attempt.action': {
      const id = e.attemptId;
      const att = id ? s.attempts[id] : undefined;
      if (e.workerId && s.statuses[e.workerId] && isFresh(clock, `action:${e.workerId}`, e.sourceTs)) {
        clock[`action:${e.workerId}`] = e.sourceTs;
        const st = s.statuses[e.workerId]!;
        if (!att || st.attemptId === att.id) {
          s.statuses = { ...s.statuses, [e.workerId]: { ...st, action: String(p.action ?? ''), tool: p.tool as string | undefined } };
        }
      }
      break;
    }
    case 'attempt.finished': {
      const att = e.attemptId ? s.attempts[e.attemptId] : undefined;
      if (!att) break;
      if (att.outcome) break; // outcomes are write-once; a late duplicate cannot change them
      s.attempts = { ...s.attempts, [att.id]: { ...att, endedAt: e.sourceTs, outcome: p.outcome as AttemptOutcome } };
      break;
    }
    case 'audit.findings': {
      const task = e.taskId ? s.tasks[e.taskId] : undefined;
      if (!task) break;
      const byId = new Map<string, AuditFinding>(task.findings.map((f) => [f.id, f]));
      for (const f of (p.findings as AuditFinding[]) ?? []) {
        const key = `finding:${f.id}`;
        if (!isFresh(clock, key, e.sourceTs)) {
          outOfOrder = true;
          continue;
        }
        clock[key] = e.sourceTs;
        byId.set(f.id, f);
      }
      s.tasks = { ...s.tasks, [task.id]: { ...task, findings: [...byId.values()] } };
      break;
    }
    case 'criteria.updated': {
      const task = e.taskId ? s.tasks[e.taskId] : undefined;
      if (!task) break;
      if (isFresh(clock, `criteria:${task.id}`, e.sourceTs)) {
        clock[`criteria:${task.id}`] = e.sourceTs;
        s.tasks = { ...s.tasks, [task.id]: { ...task, acceptanceCriteria: p.criteria as CriterionState[] } };
      } else outOfOrder = true;
      break;
    }
    case 'artifact.recorded': {
      const a = p.artifact as Artifact | undefined;
      if (!a) break;
      s.artifacts = { ...s.artifacts, [a.id]: a };
      const task = s.tasks[a.taskId];
      if (task && !task.artifactIds.includes(a.id)) {
        s.tasks = { ...s.tasks, [task.id]: { ...task, artifactIds: [...task.artifactIds, a.id] } };
      }
      break;
    }
    case 'worker.state': {
      if (!e.workerId) break;
      const key = `worker:${e.workerId}`;
      if (!isFresh(clock, key, e.sourceTs)) {
        outOfOrder = true;
        break;
      }
      clock[key] = e.sourceTs;
      const prev = s.statuses[e.workerId];
      const worker = s.workers[e.workerId];
      const state = p.state as WorkerState;
      const departmentId =
        (p.departmentId as string | undefined) ??
        (state === 'idle' && worker ? loungeOf(worker.businessId) : prev?.departmentId ?? worker?.homeDepartmentId ?? 'unknown');
      const keepsTask = state === 'active' || state === 'waiting_provider' || state === 'waiting_approval' || state === 'failed';
      const next: WorkerStatus = {
        workerId: e.workerId,
        state,
        departmentId,
        taskId: keepsTask ? e.taskId ?? prev?.taskId : undefined,
        attemptId: keepsTask ? e.attemptId ?? prev?.attemptId : undefined,
        sessionId: keepsTask ? e.sessionId ?? prev?.sessionId : undefined,
        provider: keepsTask ? (p.provider as ProviderRef | undefined) ?? prev?.provider : undefined,
        action: (p.action as string | undefined) ?? (keepsTask ? prev?.action : undefined),
        tool: keepsTask ? (p.tool as string | undefined) ?? prev?.tool : undefined,
        stateSince: prev && prev.state === state && prev.taskId === (keepsTask ? e.taskId ?? prev?.taskId : undefined) ? prev.stateSince : e.sourceTs,
        lastObservedAt: Math.max(prev?.lastObservedAt ?? 0, e.sourceTs),
      };
      s.statuses = { ...s.statuses, [e.workerId]: next };
      break;
    }
    case 'worker.heartbeat': {
      // Handled by the generic "observed" bump above; a heartbeat for a worker
      // we have no status for creates an explicit unknown status.
      if (e.workerId && !s.statuses[e.workerId]) {
        const worker = s.workers[e.workerId];
        s.statuses = {
          ...s.statuses,
          [e.workerId]: {
            workerId: e.workerId,
            state: 'unknown',
            departmentId: worker?.homeDepartmentId ?? 'unknown',
            stateSince: e.sourceTs,
            lastObservedAt: e.sourceTs,
          },
        };
      }
      break;
    }
    case 'capacity.updated': {
      const cap = p.capacity as ProviderCapacity | undefined;
      if (!cap) break;
      const key = `capacity:${cap.id}`;
      if (isFresh(clock, key, e.sourceTs)) {
        clock[key] = e.sourceTs;
        s.capacity = { ...s.capacity, [cap.id]: cap };
      } else outOfOrder = true;
      break;
    }
    case 'ledger.updated': {
      const book = p.book as WorkshopState['ledger'][string] | undefined;
      if (!book) break;
      const key = `ledger:${e.businessId}`;
      if (isFresh(clock, key, e.sourceTs)) {
        clock[key] = e.sourceTs;
        s.ledger = { ...s.ledger, [e.businessId]: book };
      } else outOfOrder = true;
      break;
    }
    case 'redirect.acknowledged':
    case 'redirect.applied':
    case 'redirect.rejected': {
      const id = String(p.redirectId ?? '');
      const next: RedirectState = e.type === 'redirect.acknowledged' ? 'acknowledged' : e.type === 'redirect.applied' ? 'applied' : 'rejected';
      const prev = s.redirects[id];
      const base: RedirectRequest = prev ?? {
        id,
        workerId: e.workerId ?? '',
        taskId: e.taskId ?? '',
        instruction: String(p.instruction ?? ''),
        state: 'requested',
        simulated: Boolean(p.simulated),
        history: [],
      };
      // Terminal states never regress (an out-of-order ack after applied is ignored).
      const rank: Record<RedirectState, number> = { requested: 0, acknowledged: 1, applied: 2, rejected: 2 };
      if (rank[next] < rank[base.state]) {
        outOfOrder = true;
        break;
      }
      s.redirects = {
        ...s.redirects,
        [id]: {
          ...base,
          state: next,
          reason: next === 'rejected' ? String(p.reason ?? 'Rejected') : base.reason,
          history: [...base.history, { state: next, at: e.sourceTs, note: p.note as string | undefined }],
        },
      };
      boundRedirects(s.redirects);
      break;
    }
  }

  if (outOfOrder) s.stats = { ...s.stats, outOfOrder: s.stats.outOfOrder + 1 };

  const entry = describe(s, e);
  if (entry) {
    s.timeline = insertSorted(s.timeline, entry, LIMITS.timeline);
    if (entry.taskId) {
      s.taskTimeline = { ...s.taskTimeline, [entry.taskId]: insertSorted(s.taskTimeline[entry.taskId] ?? [], entry, LIMITS.taskTimeline) };
    }
  }
  return s;
}

function insertSorted(list: TimelineEntry[], entry: TimelineEntry, limit: number): TimelineEntry[] {
  const out = list.slice();
  let i = out.length;
  while (i > 0 && out[i - 1]!.at > entry.at) i--;
  out.splice(i, 0, entry);
  return out.length > limit ? out.slice(out.length - limit) : out;
}

function putRedirect(state: WorkshopState, r: RedirectRequest): WorkshopState {
  const redirects = { ...state.redirects, [r.id]: r };
  const keys = Object.keys(redirects);
  if (keys.length > LIMITS.redirects) delete redirects[keys[0]!];
  return { ...state, redirects };
}

const STAGE_LABEL: Record<string, string> = {
  research: 'Research',
  creation: 'Creation',
  audit: 'Audit',
  fixes: 'Fixes',
  ready: 'Ready',
  feeds: 'Feeds',
  rules: 'Rules',
  trader_watch: 'Trader Watch',
  portfolio: 'Paper Portfolio',
  rejected: 'Rejected',
  hq: 'Hermes HQ',
};

const STATE_LABEL: Record<WorkerState, string> = {
  active: 'Working',
  idle: 'Idle',
  waiting_provider: 'Waiting for provider',
  waiting_approval: 'Waiting for approval',
  failed: 'Failed',
  offline: 'Offline',
  unknown: 'Unknown',
};

export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage;
}

export function stateLabel(state: WorkerState): string {
  return STATE_LABEL[state];
}

/** Human-readable, sanitized timeline text. Heartbeats are not shown. */
function describe(s: WorkshopState, e: ActivityEvent): TimelineEntry | null {
  const p = e.payload as Record<string, any>;
  const who = e.workerId ? s.workers[e.workerId]?.name ?? e.workerId : 'System';
  const task = e.taskId ? s.tasks[e.taskId] : undefined;
  const title = task?.title ?? e.taskId ?? '';
  let text: string;
  switch (e.type) {
    case 'task.created':
      text = `Queued "${title}"`;
      break;
    case 'task.assigned':
      text = `${who} picked up ${stageLabel(String(p.stage ?? task?.stage))} for "${title}"`;
      break;
    case 'task.handoff':
      text =
        p.outcome === 'failed_audit'
          ? `Audit failed - "${title}" sent to Fixes`
          : p.outcome === 'repaired'
            ? `Repair done - "${title}" back to Audit`
            : p.outcome === 'rejected'
              ? `"${title}" rejected at ${stageLabel(p.from)}`
            : p.outcome === 'dispatched'
              ? `HQ dispatched "${title}"`
              : `"${title}" ${stageLabel(p.from)} -> ${stageLabel(p.to)}`;
      break;
    case 'task.status':
      text = `"${title}" ${String(p.status).replace('_', ' ')}${p.reason ? ` - ${p.reason}` : ''}`;
      break;
    case 'task.ready':
      text = `"${title}" is ready (not sent or published)`;
      break;
    case 'attempt.action':
      text = `${who}: ${p.action}`;
      break;
    case 'attempt.finished':
      text = `${who} finished attempt (${p.outcome})`;
      break;
    case 'audit.findings': {
      const open = ((p.findings as AuditFinding[]) ?? []).filter((f) => !f.resolved);
      text = open.length ? `${who} flagged ${open.length} issue${open.length > 1 ? 's' : ''}` : `${who} confirmed findings resolved`;
      break;
    }
    case 'artifact.recorded':
      text = `${who} recorded ${(p.artifact as Artifact)?.title ?? 'an artifact'}`;
      break;
    case 'worker.state':
      text = `${who} is ${STATE_LABEL[p.state as WorkerState]?.toLowerCase() ?? p.state}`;
      break;
    case 'capacity.updated': {
      const c = p.capacity as ProviderCapacity;
      text = `${c.provider} capacity: ${c.availability.value ?? 'unknown'}`;
      break;
    }
    case 'redirect.acknowledged':
      text = `${who} acknowledged redirect (simulated)`;
      break;
    case 'redirect.applied':
      text = `${who} applied redirect (simulated)`;
      break;
    case 'redirect.rejected':
      text = `Redirect rejected: ${p.reason ?? ''}`;
      break;
    default:
      return null;
  }
  return { eventId: e.id, at: e.sourceTs, type: e.type, businessId: e.businessId, workerId: e.workerId, taskId: e.taskId, text };
}

export { departmentForStage };
