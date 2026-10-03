import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUSINESSES } from '../src/core/config';
import { normalizeControlView, normalizeReceipt } from '../src/core/v2Contracts';
import { V2Store } from '../src/ui/v2Store';
const fixture = () => ({ version: 2, revision: 2, companies: Object.fromEntries(BUSINESSES.map((b) => [b.id, { lifecycle: 'running', weight: 25, maxConcurrent: b.id === 'uditus' ? 1 : 3, tokenLimit: null, requestLimit: null, spendLimitMicros: null, consumedTokens: 2, consumedRequests: 1, consumedCostMicros: 0 }])), capabilities: { companyControl: true, allocations: true, chat: true }, receipts: [], recipient: 'Hermes verified fixture' });
afterEach(() => vi.unstubAllGlobals());
describe('V2 authenticated response boundaries', () => {
  it('requires exactly the known companies, bounded safe numbers, strict capabilities and allowlisted receipts', () => {
    expect(normalizeControlView(fixture())).not.toBeNull();
    for (const bad of [
      { ...fixture(), companies: { ...fixture().companies, unexpected: fixture().companies.uditus } },
      { ...fixture(), capabilities: { companyControl: 'true', allocations: true, chat: true } },
      { ...fixture(), companies: { ...fixture().companies, uditus: { ...fixture().companies.uditus, tokenLimit: 1.5 } } },
      { ...fixture(), companies: { ...fixture().companies, uditus: { ...fixture().companies.uditus, consumedTokens: -1 } } },
      { ...fixture(), receipts: [{ id: 'ok', type: 'delete.database', state: 'effective', at: 1 }] },
      { ...fixture(), receipts: Array.from({ length: 501 }, (_, i) => ({ id: `r-${i}`, type: 'company.stop', state: 'effective', at: 1 })) },
    ]) expect(normalizeControlView(bad)).toBeNull();
    expect(normalizeReceipt({ id: 'ok', type: 'company.stop', state: 'effective', at: Number.MAX_SAFE_INTEGER + 1 })).toBeNull();
  });
  it('pending live discovery cannot overwrite a new demo source even if live was reselected', async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    const controls = new V2Store();
    controls.reset('live');
    const pending = controls.refresh();
    controls.reset('demo');
    controls.reset('live');
    resolve(new Response(JSON.stringify(fixture()), { status: 200 }));
    await pending;
    expect(controls.get().revision).toBe(0);
    expect(controls.get().capabilities.chat).toBe(false);
    expect(controls.get().companies.uditus?.lifecycle).toBe('unknown');
  });
  it('pending live chat and failed commands never leak messages/errors/busy state across source reset', async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    const controls = new V2Store();
    controls.reset('live');
    controls.update({ capabilities: { companyControl: true, allocations: true, chat: true } });
    const chat = controls.chat('hello');
    controls.reset('demo');
    resolve(new Response(JSON.stringify({ state: 'failed', error: 'old failure' }), { status: 503 }));
    await chat;
    expect(controls.get().messages).toEqual([]);
    expect(controls.get().error).toBeUndefined();
    controls.reset('live');
    controls.update({ capabilities: { companyControl: true, allocations: true, chat: true } });
    const command = controls.command('company.stop', 'uditus');
    controls.reset('demo');
    resolve(new Response(JSON.stringify({ error: 'expired' }), { status: 409 }));
    await command;
    expect(controls.get().receipts).toEqual([]);
    expect(controls.get().busy).toBe(false);
    expect(controls.get().error).toBeUndefined();
  });
  it('displays the server error and rejects malformed command receipts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Policy revision conflict; reload current policy' }), { status: 409 })));
    const controls = new V2Store();
    controls.reset('live');
    controls.update({ capabilities: { companyControl: true, allocations: true, chat: true } });
    await controls.command('company.stop', 'uditus');
    expect(controls.get().error).toContain('Policy revision conflict');
    expect(controls.get().receipts[0]?.state).toBe('rejected');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'incorrect', type: 'company.stop', state: 'effective', at: Date.now() }), { status: 200 })));
    await controls.command('company.stop', 'uditus');
    expect(controls.get().error).toContain('invalid command receipt');
  });
});
