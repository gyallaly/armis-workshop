import { describe, expect, it } from 'vitest';
import { DemoSim, type ScenarioId } from '../src/adapters/demo/sim';
import { STARTING_BANKROLL } from '../src/adapters/demo/ledger';
import type { ActivityEvent } from '../src/core/types';

function runFor(scenario: ScenarioId, minutes: number) {
  const sim = new DemoSim(7, scenario);
  const events: ActivityEvent[] = [];
  for (let t = sim.t; t < sim.loadAt + minutes * 60_000; t += 5000) events.push(...sim.advanceTo(t));
  const book = sim.truth.ledger['aster-ledger']!;
  return { sim, events, book };
}

describe('Aster Ledger paper book', () => {
  it('starts from a $20 demo bankroll and keeps the capital identity', () => {
    const { book } = runFor('steady', 12);
    expect(book.paper).toBe(true);
    expect(book.startingBankroll).toBe(STARTING_BANKROLL);
    expect(book.reserved).toBeGreaterThanOrEqual(0);
    const reservedFromPositions = book.positions.reduce((s, p) => s + p.qty * p.avgPrice, 0);
    expect(book.reserved).toBeCloseTo(reservedFromPositions, 1);
    expect(book.drawdownPct).toBeGreaterThanOrEqual(0);
    expect(book.peakEquity).toBeGreaterThanOrEqual(STARTING_BANKROLL);
  });

  it('keeps operating costs separate from trading P&L', () => {
    const { book } = runFor('steady', 5);
    expect(book.operatingCosts.length).toBeGreaterThan(0);
    expect(book.operatingCosts.every((c) => c.provenance !== 'provider_reported')).toBe(true);
  });

  it('demonstrates a partial exit, a hedge warning and a close recommendation', () => {
    const { book } = runFor('steady', 3);
    expect(book.positions.find((p) => p.id === 'pos-1')?.exit?.status).toBe('partial');
    expect(book.positions.filter((p) => p.hedgeWarning && p.pairedWith).length).toBe(2);
    expect(book.positions.some((p) => p.recommendation === 'close')).toBe(true);
    // every position links to evidence
    for (const p of book.positions) expect(book.candidates[p.candidateId]).toBeDefined();
  });

  it('most candidates do not become trades; rejections take an explicit path', () => {
    const { book, events } = runFor('steady', 20);
    const decided = Object.values(book.candidates).filter((c) => c.decision !== 'pending' && !c.taskId.startsWith('seed'));
    const entries = decided.filter((c) => c.decision === 'paper_entry');
    expect(decided.length).toBeGreaterThan(3);
    expect(entries.length).toBeLessThan(decided.length / 2);
    expect(events.some((e) => e.type === 'task.handoff' && e.payload.outcome === 'rejected')).toBe(true);
  });

  it.each([
    ['ledger-stale-quotes', /older than 60 s/],
    ['ledger-conflicting', /Conflicting sources/],
    ['ledger-failed-audit', /Audit failed/],
    ['ledger-no-opportunity', /No eligible opportunity/],
  ] as [ScenarioId, RegExp][])('scenario %s rejects for the right reason', (scenario, reason) => {
    const { book } = runFor(scenario, 15);
    const reasons = Object.values(book.candidates).map((c) => c.reason ?? '');
    expect(reasons.some((r) => reason.test(r))).toBe(true);
    if (scenario === 'ledger-no-opportunity') {
      expect(Object.values(book.candidates).filter((c) => c.decision === 'paper_entry' && !c.taskId.startsWith('seed')).length).toBe(0);
    }
  });

  it('provider outage: candidates wait for capacity, nothing is decided', () => {
    const { sim } = runFor('ledger-provider-out', 3);
    const waiting = Object.values(sim.truth.tasks).filter((t) => t.businessId === 'aster-ledger' && t.status === 'waiting_provider');
    expect(waiting.length).toBeGreaterThan(0);
  });

  it('venue board distinguishes Polymarket International from Polymarket US', () => {
    const { book } = runFor('steady', 2);
    const names = book.venues.map((v) => v.name);
    expect(names).toContain('Polymarket (International)');
    expect(names).toContain('Polymarket US');
    expect(book.venues.some((v) => !v.configured)).toBe(true);
  });

  it('ledger data is isolated to its own business id', () => {
    const { events } = runFor('steady', 5);
    for (const e of events.filter((e) => e.type === 'ledger.updated')) expect(e.businessId).toBe('aster-ledger');
    for (const e of events.filter((e) => e.taskId?.startsWith('cand-'))) expect(e.businessId).toBe('aster-ledger');
  });
});
