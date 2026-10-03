import { describe, expect, it } from 'vitest';
import { ROSTER } from '../src/core/config';
import { applyEvent, initialState, reduce } from '../src/core/reducer';
import { STALE_AFTER_MS, businessCounts, departmentCounts, displayStatus } from '../src/core/selectors';
import type { ActivityEvent, WorkshopState } from '../src/core/types';

const T0 = 1_000_000;
let n = 0;
function ev(partial: Partial<ActivityEvent> & Pick<ActivityEvent, 'type'>): ActivityEvent {
  n++;
  return {
    id: partial.id ?? `e${n}`,
    sourceTs: partial.sourceTs ?? T0 + n,
    receivedTs: partial.receivedTs ?? T0 + n + 10,
    businessId: partial.businessId ?? 'uditus',
    payload: partial.payload ?? {},
    ...partial,
  } as ActivityEvent;
}

function fresh(): WorkshopState {
  return initialState(ROSTER, 'demo', T0);
}

function withTask(s: WorkshopState, id = 't1', stage = 'research'): WorkshopState {
  return applyEvent(s, ev({ type: 'task.created', taskId: id, sourceTs: T0, payload: { title: 'Task', criteria: ['a', 'b'], stage, eligibleCapacity: ['cap-codex'] } }));
}

describe('reducer: de-duplication and ordering', () => {
  it('ignores a duplicate event id', () => {
    let s = withTask(fresh());
    const e = ev({ type: 'task.status', taskId: 't1', payload: { status: 'held', reason: 'x' } });
    s = applyEvent(s, e);
    const again = applyEvent(s, e);
    expect(again.stats.duplicates).toBe(1);
    expect(again.tasks.t1!.status).toBe('held');
    expect(again.timeline.length).toBe(s.timeline.length);
  });

  it('does not let an older worker.state overwrite a newer one', () => {
    let s = fresh();
    s = applyEvent(s, ev({ type: 'worker.state', workerId: 'uditus.reviewer', sourceTs: T0 + 500, payload: { state: 'idle' } }));
    s = applyEvent(s, ev({ type: 'worker.state', workerId: 'uditus.reviewer', sourceTs: T0 + 100, payload: { state: 'active', departmentId: 'uditus:quality' } }));
    expect(s.statuses['uditus.reviewer']!.state).toBe('idle');
    expect(s.stats.outOfOrder).toBe(1);
  });

  it('still records late events in the timeline in source order', () => {
    let s = withTask(fresh());
    s = applyEvent(s, ev({ type: 'task.status', taskId: 't1', sourceTs: T0 + 900, payload: { status: 'held', reason: 'late' } }));
    s = applyEvent(s, ev({ type: 'task.status', taskId: 't1', sourceTs: T0 + 300, payload: { status: 'queued' } }));
    const times = s.taskTimeline.t1!.map((e) => e.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(s.tasks.t1!.status).toBe('held');
  });

  it('redirect states never regress', () => {
    let s = fresh();
    s = applyEvent(s, ev({ type: 'redirect.applied', workerId: 'uditus.creator', taskId: 't1', sourceTs: T0 + 50, payload: { redirectId: 'r1' } }));
    s = applyEvent(s, ev({ type: 'redirect.acknowledged', workerId: 'uditus.creator', taskId: 't1', sourceTs: T0 + 40, payload: { redirectId: 'r1' } }));
    expect(s.redirects.r1!.state).toBe('applied');
  });
});

describe('reducer: truthful state', () => {
  it('a handoff to ready is not readiness - only task.ready is', () => {
    let s = withTask(fresh(), 't1', 'audit');
    s = applyEvent(s, ev({ type: 'task.assigned', taskId: 't1', workerId: 'uditus.reviewer', attemptId: 'a1', sessionId: 's1', payload: { stage: 'audit' } }));
    s = applyEvent(s, ev({ type: 'task.handoff', taskId: 't1', payload: { from: 'audit', to: 'ready', outcome: 'ready' } }));
    expect(s.tasks.t1!.status).not.toBe('ready');
    s = applyEvent(s, ev({ type: 'task.ready', taskId: 't1' }));
    expect(s.tasks.t1!.status).toBe('ready');
  });

  it('an attempt without a finished event has no outcome', () => {
    let s = withTask(fresh());
    s = applyEvent(s, ev({ type: 'task.assigned', taskId: 't1', workerId: 'uditus.researcher', attemptId: 'a1', sessionId: 's1', payload: { stage: 'research' } }));
    expect(s.attempts.a1!.outcome).toBeUndefined();
    expect(s.attempts.a1!.workerId).toBe('uditus.researcher');
    expect(s.attempts.a1!.sessionId).toBe('s1');
  });

  it('keeps stable identity separate from session ids', () => {
    let s = withTask(fresh());
    s = applyEvent(s, ev({ type: 'task.assigned', taskId: 't1', workerId: 'uditus.researcher', attemptId: 'a1', sessionId: 's1' }));
    s = applyEvent(s, ev({ type: 'task.assigned', taskId: 't1', workerId: 'uditus.researcher', attemptId: 'a2', sessionId: 's2' }));
    expect(s.workers['uditus.researcher']!.name).toBe('Researcher');
    expect(s.tasks.t1!.attemptIds).toEqual(['a1', 'a2']);
  });

  it('failed audit -> fixes -> repaired increments the repair count', () => {
    let s = withTask(fresh(), 't1', 'audit');
    s = applyEvent(s, ev({ type: 'task.handoff', taskId: 't1', payload: { from: 'audit', to: 'fixes', outcome: 'failed_audit' } }));
    expect(s.tasks.t1!.stage).toBe('fixes');
    s = applyEvent(s, ev({ type: 'task.handoff', taskId: 't1', payload: { from: 'fixes', to: 'audit', outcome: 'repaired' } }));
    expect(s.tasks.t1!.stage).toBe('audit');
    expect(s.tasks.t1!.repairCount).toBe(1);
    expect(s.traffic.map((d) => d.outcome)).toEqual(['failed_audit', 'repaired']);
  });
});

describe('selectors: stale and disconnected data', () => {
  it('a worker silent past the threshold is shown unknown, not active', () => {
    let s = fresh();
    s = applyEvent(s, ev({ type: 'worker.state', workerId: 'uditus.creator', sourceTs: T0, payload: { state: 'active', departmentId: 'uditus:delivery' } }));
    s = reduce(s, { kind: 'tick', now: T0 + 1000 });
    expect(displayStatus(s, s.workers['uditus.creator']!).state).toBe('active');
    s = reduce(s, { kind: 'tick', now: T0 + STALE_AFTER_MS + 1 });
    const d = displayStatus(s, s.workers['uditus.creator']!);
    expect(d.state).toBe('unknown');
    expect(d.reported).toBe('active');
    expect(d.stale).toBe(true);
  });

  it('reconnecting makes everything stale', () => {
    let s = fresh();
    s = applyEvent(s, ev({ type: 'worker.state', workerId: 'uditus.creator', payload: { state: 'active', departmentId: 'uditus:delivery' } }));
    s = reduce(s, { kind: 'connection', connection: 'reconnecting' });
    expect(displayStatus(s, s.workers['uditus.creator']!).state).toBe('unknown');
  });

  it('a worker with no status at all is unknown', () => {
    const s = fresh();
    expect(displayStatus(s, s.workers['uditus.fixer']!).state).toBe('unknown');
  });

  it('offline is not turned into unknown by age', () => {
    let s = fresh();
    s = applyEvent(s, ev({ type: 'worker.state', workerId: 'etsy.fixer', businessId: 'etsy-studio', sourceTs: T0, payload: { state: 'offline' } }));
    s = reduce(s, { kind: 'tick', now: T0 + STALE_AFTER_MS * 3 });
    expect(displayStatus(s, s.workers['etsy.fixer']!).state).toBe('offline');
  });
});

describe('selectors: counts do not conflate', () => {
  it('separates active, roster, queued and held', () => {
    let s = fresh();
    s = withTask(s, 't1', 'audit');
    s = withTask(s, 't2', 'audit');
    s = applyEvent(s, ev({ type: 'task.status', taskId: 't2', payload: { status: 'held', reason: 'needs you' } }));
    s = applyEvent(s, ev({ type: 'worker.state', workerId: 'uditus.reviewer', payload: { state: 'active', departmentId: 'uditus:quality' } }));
    s = applyEvent(s, ev({ type: 'worker.state', workerId: 'uditus.quality', payload: { state: 'idle' } }));
    const audit = departmentCounts(s, 'uditus:quality');
    expect(audit.active).toBe(1);
    expect(audit.roster).toBe(2);
    expect(audit.queued).toBe(1);
    expect(audit.held).toBe(1);
    const lounge = departmentCounts(s, 'uditus:lounge');
    expect(lounge.present).toBe(7);
    expect(lounge.unknown).toBe(6);
    expect(lounge.idle).toBe(1);
    const biz = businessCounts(s, 'uditus');
    expect(biz.roster).toBe(ROSTER.filter((w) => w.businessId === 'uditus').length);
    expect(biz.active).toBe(1);
  });
});

describe('snapshots', () => {
  it('reconnect snapshot replaces status but keeps roster identity', () => {
    let s = fresh();
    s = applyEvent(s, ev({ type: 'worker.state', workerId: 'uditus.creator', payload: { state: 'active', departmentId: 'uditus:delivery' } }));
    s = reduce(s, {
      kind: 'snapshot',
      connection: 'demo',
      snapshot: { takenAt: T0 + 5000, workers: [], statuses: [], tasks: [], attempts: [], artifacts: [], capacity: [] },
    });
    expect(s.workers['uditus.creator']!.name).toBe('Creator');
    expect(s.statuses['uditus.creator']).toBeUndefined();
    expect(displayStatus(s, s.workers['uditus.creator']!).state).toBe('unknown');
  });
});

describe('lights out', () => {
  const cap = (id: string, value: 'available' | 'unavailable' | 'unknown') => ({
    type: 'capacity.updated' as const,
    businessId: 'hermes-hq',
    payload: {
      capacity: {
        id,
        provider: id,
        scope: { kind: 'account', label: id },
        models: [],
        modelsIllustrative: true,
        availability: { value, provenance: 'provider_reported' },
        remaining: { value: null, provenance: 'unknown' },
        resetAt: { value: null, provenance: 'unknown' },
        local: { requests: { value: 0, provenance: 'locally_measured' }, tokens: { value: 0, provenance: 'locally_measured' }, windowLabel: '' },
        lastCheckedAt: T0,
      },
    },
  });
  it('only when every known scope is unavailable; unknown or empty never counts', async () => {
    const { capacityOut } = await import('../src/core/selectors');
    let s = fresh();
    expect(capacityOut(s)).toBe(false);
    s = applyEvent(s, ev(cap('a', 'unavailable')));
    s = applyEvent(s, ev(cap('b', 'available')));
    expect(capacityOut(s)).toBe(false);
    s = applyEvent(s, ev(cap('b', 'unavailable')));
    expect(capacityOut(s)).toBe(true);
    s = applyEvent(s, ev(cap('b', 'unknown')));
    expect(capacityOut(s)).toBe(false);
  });
});
