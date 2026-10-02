import type { ActivityEvent, ActivityEventType, TaskStatus, WorkerState } from './types';

const TYPES = new Set<ActivityEventType>([
  'task.created', 'task.assigned', 'task.handoff', 'task.status', 'task.ready', 'attempt.started', 'attempt.action',
  'attempt.finished', 'audit.findings', 'criteria.updated', 'artifact.recorded', 'worker.state', 'worker.heartbeat',
  'capacity.updated', 'redirect.acknowledged', 'redirect.applied', 'redirect.rejected', 'ledger.updated',
]);
const WORKER_STATES = new Set<WorkerState>(['active', 'idle', 'waiting_provider', 'waiting_approval', 'failed', 'offline', 'unknown']);
const TASK_STATUSES = new Set<TaskStatus>(['queued', 'in_progress', 'waiting_provider', 'waiting_approval', 'held', 'failed', 'ready', 'rejected']);

/**
 * Boundary check for anything arriving from an adapter. Unknown enum values
 * become 'unknown' (never a plausible-looking state); malformed events are
 * dropped (returns null) rather than half-applied.
 */
export function normalizeEvent(e: ActivityEvent): ActivityEvent | null {
  if (!e || typeof e.id !== 'string' || !e.id || !TYPES.has(e.type)) return null;
  if (typeof e.sourceTs !== 'number' || !Number.isFinite(e.sourceTs) || typeof e.businessId !== 'string') return null;
  const p = (e.payload && typeof e.payload === 'object' ? e.payload : {}) as Record<string, unknown>;
  if (e.type === 'worker.state') {
    if (!e.workerId) return null;
    const state = WORKER_STATES.has(p.state as WorkerState) ? p.state : 'unknown';
    return { ...e, payload: { ...p, state } };
  }
  if (e.type === 'task.status' && !TASK_STATUSES.has(p.status as TaskStatus)) return null;
  if (e.type === 'capacity.updated') {
    const c = p.capacity as Record<string, any> | undefined;
    if (!c || typeof c.id !== 'string' || !c.availability || !c.remaining || !c.resetAt || !c.local) return null;
  }
  return { ...e, payload: p };
}
