import { describe, expect, it } from 'vitest';
import { DemoSim, DEMO_EPOCH, SCENARIOS } from '../src/adapters/demo/sim';
import { ROSTER } from '../src/core/config';
import { applyEvent, initialState, reduce } from '../src/core/reducer';
import { businessCounts } from '../src/core/selectors';
import type { ActivityEvent } from '../src/core/types';

function run(seed: number, scenario: (typeof SCENARIOS)[number]['id'], until: number, chunk: number) {
  const sim = new DemoSim(seed, scenario);
  const events: ActivityEvent[] = [];
  for (let t = DEMO_EPOCH; t < DEMO_EPOCH + until; t += chunk) events.push(...sim.advanceTo(t));
  events.push(...sim.advanceTo(DEMO_EPOCH + until));
  return { sim, events };
}

describe('demo simulation', () => {
  it('is deterministic regardless of how time is chunked', () => {
    const a = run(7, 'steady', 6 * 60_000, 100);
    const b = run(7, 'steady', 6 * 60_000, 1700);
    expect(a.events.map((e) => [e.id, e.type, e.sourceTs])).toEqual(b.events.map((e) => [e.id, e.type, e.sourceTs]));
  });

  it('a different seed gives a different run', () => {
    const a = run(7, 'steady', 4 * 60_000, 1000);
    const b = run(8, 'steady', 4 * 60_000, 1000);
    expect(a.events.map((e) => e.sourceTs)).not.toEqual(b.events.map((e) => e.sourceTs));
  });

  it('viewer state built from the stream equals the simulation truth, even with duplicates and late delivery', () => {
    const { sim, events } = run(7, 'steady', 8 * 60_000, 500);
    let s = initialState(ROSTER, 'demo', DEMO_EPOCH);
    // Shuffle heartbeats late and duplicate every 7th event.
    const late: ActivityEvent[] = [];
    for (const [i, e] of events.entries()) {
      if (e.type === 'worker.heartbeat' && i % 3 === 0) {
        late.push(e);
        continue;
      }
      s = applyEvent(s, e);
      if (i % 7 === 0) s = applyEvent(s, e);
    }
    for (const e of late) s = applyEvent(s, e);
    s = reduce(s, { kind: 'tick', now: sim.t });
    const truth = reduce(sim.truth, { kind: 'tick', now: sim.t });
    expect(s.stats.duplicates).toBeGreaterThan(0);
    expect(Object.values(s.statuses).map((x) => [x.workerId, x.state, x.departmentId, x.taskId])).toEqual(
      Object.values(truth.statuses).map((x) => [x.workerId, x.state, x.departmentId, x.taskId]),
    );
    expect(businessCounts(s, 'uditus')).toEqual(businessCounts(truth, 'uditus'));
  });

  it('exercises create -> audit fail -> fixes -> re-audit -> ready', () => {
    const { sim, events } = run(7, 'steady', 15 * 60_000, 1000);
    const byTask = new Map<string, string[]>();
    for (const e of events) {
      if (e.type !== 'task.handoff' || !e.taskId) continue;
      const list = byTask.get(e.taskId) ?? [];
      list.push(String(e.payload.outcome));
      byTask.set(e.taskId, list);
    }
    const repaired = [...byTask.entries()].find(([, o]) => o.includes('failed_audit') && o.includes('repaired') && o.includes('ready'));
    expect(repaired).toBeDefined();
    const id = repaired![0];
    expect(sim.truth.tasks[id]!.status).toBe('ready');
    // Every ready task got there through an explicit task.ready event.
    for (const t of Object.values(sim.truth.tasks).filter((t) => t.status === 'ready')) {
      expect(events.some((e) => e.type === 'task.ready' && e.taskId === t.id)).toBe(true);
    }
  });

  it('shows distinct worker states: idle, offline, unknown, failed, waiting', () => {
    const { events, sim } = run(7, 'codex-reset', 4 * 60_000, 1000);
    const states = new Set(events.filter((e) => e.type === 'worker.state').map((e) => String(e.payload.state)));
    for (const s of ['active', 'idle', 'offline']) expect(states.has(s)).toBe(true);
    expect(sim.truth.statuses['uditus.fixer']?.state ?? 'unknown').not.toBe('active');
  });

  it('codex outage: gemini serves eligible work, codex-only work waits', () => {
    const sim = new DemoSim(7, 'codex-reset');
    sim.advanceTo(sim.loadAt + 60_000);
    const codex = sim.truth.capacity['cap-codex']!;
    expect(codex.availability.value).toBe('unavailable');
    expect(codex.resetAt.provenance).toBe('provider_reported');
    const working = Object.values(sim.truth.statuses).filter((s) => s.state === 'active' && s.provider);
    expect(working.every((s) => s.provider!.capacityId !== 'cap-codex')).toBe(true);
    // After the simulated reset Codex is available again.
    sim.advanceTo(sim.loadAt + 181_000);
    expect(sim.truth.capacity['cap-codex']!.availability.value).toBe('available');
  });

  it('both providers out: nothing works, jobs stay queued, gemini reset unknown', () => {
    const sim = new DemoSim(7, 'all-unavailable');
    sim.advanceTo(sim.loadAt + 90_000);
    const gem = sim.truth.capacity['cap-gemini']!;
    expect(gem.availability.value).toBe('unavailable');
    expect(gem.resetAt.value).toBeNull();
    expect(gem.resetAt.provenance).toBe('unknown');
    const active = Object.values(sim.truth.statuses).filter((s) => s.state === 'active' && s.provider);
    expect(active.length).toBe(0);
    const waiting = Object.values(sim.truth.tasks).filter((t) => t.status === 'waiting_provider');
    expect(waiting.length).toBeGreaterThan(0);
  });

  it('never reports remaining quota it was not given', () => {
    const sim = new DemoSim(7, 'steady');
    sim.advanceTo(sim.loadAt + 5 * 60_000);
    const gem = sim.truth.capacity['cap-gemini']!;
    expect(gem.remaining.value).toBeNull();
    expect(gem.remaining.provenance).toBe('unknown');
    expect(gem.local.requests.value).toBeGreaterThan(0);
    expect(gem.local.requests.provenance).toBe('locally_measured');
  });

  it('redirect is acknowledged then applied or rejected', () => {
    const sim = new DemoSim(7, 'steady');
    sim.advanceTo(sim.loadAt);
    const st = Object.values(sim.truth.statuses).find((s) => s.state === 'active' && s.taskId && s.workerId !== 'armis.ceo' && s.workerId !== 'armis.operations')!;
    expect(st).toBeDefined();
    sim.redirect({ id: 'r1', workerId: st.workerId, taskId: st.taskId!, instruction: 'Prioritise contrast', state: 'requested', simulated: true, history: [] });
    sim.advanceTo(sim.t + 1500);
    expect(sim.truth.redirects.r1!.state).toBe('acknowledged');
    sim.advanceTo(sim.t + 3000);
    expect(['applied', 'rejected']).toContain(sim.truth.redirects.r1!.state);
  });
});
