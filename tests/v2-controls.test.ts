import { describe, expect, it, vi } from 'vitest';
import { DemoSim } from '../src/adapters/demo/sim';
import { DemoAdapter } from '../src/adapters/demo/demoAdapter';
import { normalizeEvent } from '../src/core/normalize';

describe('V2 deterministic owner policy', () => {
  it('simulation replay and scenario changes preserve shutdown fences and owner ceilings before warmup', () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const adapter = new DemoAdapter({ seed: 7 });
    const snapshot = vi.fn();
    try {
      adapter.start({ snapshot, events: vi.fn(), connection: vi.fn(), tick: vi.fn(), reset: vi.fn() });
      adapter.companyPolicy('uditus', { lifecycle: 'stopped', requestLimit: 0, tokenLimit: 0, weight: 0 });
      adapter.reset();
      let state = snapshot.mock.calls.at(-1)![0];
      expect(state.statuses.filter((s: { workerId: string; state: string }) => s.workerId.startsWith('uditus.')).every((s: { state: string }) => s.state === 'idle')).toBe(true);
      expect(adapter.companyUsage('uditus').consumedRequests).toBe(0);
      adapter.setScenario('codex-reset');
      state = snapshot.mock.calls.at(-1)![0];
      expect(state.attempts.some((a: { workerId: string }) => a.workerId.startsWith('uditus.'))).toBe(false);
      expect(adapter.companyUsage('uditus').consumedTokens).toBe(0);
      adapter.companyPolicy('uditus', { lifecycle: 'running', weight: 25 });
      adapter.reset();
      expect(adapter.companyUsage('uditus').consumedRequests).toBe(0); // zero ceiling also survives resume/replay
    } finally { adapter.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
  it('enforces cumulative token and request caps at every simulated call and never enables an unknown spend cap', () => {
    const sim = new DemoSim(7, 'steady');
    sim.advanceTo(sim.loadAt);
    const consumed = sim.companyUsage('uditus');
    sim.companyPolicy('uditus', { tokenLimit: consumed.consumedTokens + 100, requestLimit: consumed.consumedRequests + 1 });
    sim.advanceTo(sim.t + 180_000);
    expect(sim.companyUsage('uditus').consumedTokens).toBe(consumed.consumedTokens);
    expect(sim.companyUsage('uditus').consumedRequests).toBe(consumed.consumedRequests);
    expect(sim.snapshot().tasks.some((t) => t.businessId === 'uditus' && t.heldReason === 'Owner usage bound exhausted (simulated)')).toBe(true);
    expect(() => sim.companyPolicy('uditus', { spendLimitMicros: 500 })).toThrow('unavailable');
    sim.companyPolicy('uditus', { tokenLimit: null, requestLimit: null });
    sim.advanceTo(sim.t + 90_000);
    expect(sim.companyUsage('uditus').consumedRequests).toBeGreaterThan(consumed.consumedRequests);
  });
  it('an empty provider route allowlist prevents simulated inference', () => {
    const sim = new DemoSim(7, 'steady');
    sim.advanceTo(sim.loadAt);
    const usage = sim.companyUsage('etsy-studio');
    sim.companyPolicy('etsy-studio', { allowedProviders: [] });
    sim.advanceTo(sim.t + 90_000);
    expect(sim.companyUsage('etsy-studio')).toEqual(usage);
  });
  it('shutdown cancels company attempts and fences dispatch, action, retries and usage without stopping siblings', () => {
    const sim = new DemoSim(7, 'steady');
    sim.advanceTo(sim.loadAt);
    const before = sim.snapshot();
    const open = before.attempts.filter((a) => before.workers.find((w) => w.id === a.workerId)?.businessId === 'uditus' && !a.endedAt);
    sim.companyPolicy('uditus', { lifecycle: 'stopped' });
    const events = sim.advanceTo(sim.t + 150_000);
    expect(events.filter((e) => e.businessId === 'uditus' && ['attempt.action','task.assigned','task.created','task.ready'].includes(e.type))).toEqual([]);
    expect(events.some((e) => e.businessId === 'etsy-studio' && e.type === 'attempt.action')).toBe(true);
    const after = sim.snapshot();
    expect(after.statuses.filter((s) => s.workerId.startsWith('uditus.')).every((s) => s.state === 'idle')).toBe(true);
    for (const attempt of open) expect(after.attempts.find((a) => a.id === attempt.id)?.outcome).toBe('aborted');
  });
  it('pause blocks new jobs while existing work completes; resume reopens admission', () => {
    const sim = new DemoSim(7, 'steady');
    sim.advanceTo(sim.loadAt);
    sim.companyPolicy('etsy-studio', { lifecycle: 'draining' });
    const events = sim.advanceTo(sim.t + 90_000);
    expect(events.filter((e) => e.businessId === 'etsy-studio' && ['task.created','task.assigned'].includes(e.type))).toEqual([]);
    expect(events.some((e) => e.businessId === 'etsy-studio' && e.type === 'attempt.finished')).toBe(true);
    sim.companyPolicy('etsy-studio', { lifecycle: 'running' });
    expect(sim.advanceTo(sim.t + 90_000).some((e) => e.businessId === 'etsy-studio' && e.type === 'task.assigned')).toBe(true);
  });
  it('zero allocation closes admission and quota total stays unknown when unreported', () => {
    const sim = new DemoSim(7, 'steady');
    sim.advanceTo(sim.loadAt);
    sim.companyPolicy('aster-ledger', { weight: 0 });
    const events = sim.advanceTo(sim.t + 90_000);
    expect(events.filter((e) => e.businessId === 'aster-ledger' && e.type === 'task.assigned')).toEqual([]);
    expect(sim.snapshot().capacity.find((c) => c.id === 'cap-gemini')?.quotaWindows?.[0]?.total.value).toBeNull();
  });
  it('rejects invalid comparable quota windows at the ingestion boundary', () => {
    const sim = new DemoSim();
    const capacity = sim.snapshot().capacity[0]!;
    const event = { id: 'quota', type: 'capacity.updated', sourceTs: sim.t, receivedTs: sim.t, businessId: 'hermes-hq', payload: { capacity: { ...capacity, quotaWindows: [{ id: 'q', label: 'Bad', unit: 'requests', total: { value: 10, provenance: 'provider_reported' }, remaining: { value: 99, provenance: 'provider_reported' }, resetAt: { value: null, provenance: 'unknown' }, observedAt: sim.t }] } } };
    expect(normalizeEvent(event)).toBeNull();
  });
});
