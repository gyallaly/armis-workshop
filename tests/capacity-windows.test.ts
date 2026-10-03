import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initialState } from '../src/core/reducer';
import { capacityOut } from '../src/core/selectors';
import type { ProviderCapacity } from '../src/core/types';

const view = vi.hoisted(() => ({ state: null as any, source: 'live' }));
vi.mock('../src/ui/store', () => ({
  useWorkshop: (select: any) => select(view.state),
  useUi: (select: any) => select({ prefs: { source: view.source } }),
  ui: { setPrefs: vi.fn() },
}));
import { CapacityPanel, CapacityChip } from '../src/ui/CapacityPanel';

function capacity(patch: Partial<ProviderCapacity> = {}): ProviderCapacity {
  return {
    id: 'codex', provider: 'Codex', scope: { kind: 'account', label: 'Shared account' },
    models: [], modelsIllustrative: false,
    availability: { value: 'unavailable', provenance: 'provider_reported' },
    remaining: { value: null, provenance: 'unknown' }, resetAt: { value: null, provenance: 'unknown' },
    local: { requests: { value: null, provenance: 'unknown' }, tokens: { value: null, provenance: 'unknown' }, windowLabel: 'Observed session' },
    lastCheckedAt: 100_000, ...patch,
  };
}
function state(...caps: ProviderCapacity[]) {
  return { ...initialState([], 'connected', 100_000), capacity: Object.fromEntries(caps.map(c => [c.id, c])) };
}
function panel(s = state(capacity())) {
  view.state = s;
  return renderToStaticMarkup(createElement(CapacityPanel));
}

describe('capacity panel evidence', () => {
  it('keeps stale and unknown window evidence distinct and never promises reset recovery', () => {
    const w: import('../src/core/types').CapacityWindow = {
      id: 'session', label: 'Session', scope: 'Shared account', unit: 'percent',
      remaining: { value: 0, provenance: 'unknown', note: 'No quota observation' },
      limit: { value: null, provenance: 'unknown' }, resetAt: { value: 99_000, provenance: 'provider_reported' },
      observedAt: 0, source: 'cached header', maxAgeMs: 1000,
    };
    const c = capacity({ windows: [w], availability: { value: 'unknown', provenance: 'unknown' } });
    const html = panel(state(c));
    expect(html).toContain('Stale');
    expect(html).toContain('Not reported');
    expect(html).toContain('No quota observation');
    expect(html).not.toContain('0 percent');
    expect(html).toContain('Reset time passed; recovery not observed');
    expect(capacityOut(state(c))).toBe(false);
    expect(panel(state(capacity({ resetAt: { value: 99_000, provenance: 'provider_reported' } })))).toContain('Reset time passed; recovery not observed');
    const unknown = panel(state(capacity({ windows: [{ ...w, observedAt: null }] })));
    expect(unknown).toContain('Unknown freshness');
  });
  it('uses the same unknown display in the panel and campus chip when observations expire', () => {
    const s = state(capacity({ lastCheckedAt: 0 }));
    expect(panel(s)).toContain('avail--unknown');
    view.state = s;
    expect(renderToStaticMarkup(createElement(CapacityChip))).toContain('avail--unknown');
    expect(panel({ ...state(capacity()), connection: 'disconnected' })).toContain('avail--unknown');
  });
  it('renders independent session/week and Gemini rpm/input-tpm/rpd windows with their evidence', () => {
    const windows: import('../src/core/types').CapacityWindow[] = [
      ['session', 'Session allowance', 'percent', 20], ['week', 'Weekly allowance', 'percent', 70],
      ['rpm', 'Requests per minute', 'requests', 11], ['input-tpm', 'Input tokens per minute', 'input_tokens', 1200],
      ['rpd', 'Requests per day', 'requests', 100],
    ].map(([id, label, unit, value]) => ({
      id: id as string, label: label as string, unit: unit as import('../src/core/types').CapacityWindow['unit'],
      scope: `Shared project ${id}`, remaining: { value: value as number, provenance: 'provider_reported' },
      limit: { value: 2000, provenance: 'provider_reported' }, resetAt: { value: 110_000, provenance: 'provider_reported' },
      observedAt: 100_000, maxAgeMs: 30_000, source: `header-${id}`,
    }));
    const html = panel(state(capacity({ windows, source: 'provider headers', configured: true })));
    for (const w of windows) {
      expect(html).toContain(w.label);
      expect(html).toContain(w.scope);
      expect(html).toContain(w.source);
      expect(html).toContain(`${w.remaining.value!.toLocaleString()} ${w.unit}`);
    }
    expect(html).toContain('Configured');
    expect(html).toContain('provider headers');
    expect(html).toContain('1970-01-01T00:01:40.000Z');
    expect(html).toContain('Fresh');
    expect(html).not.toContain('<dt>Remaining</dt>');
  });
  it('labels demo by selected source, independently of connected or dropped transport', () => {
    view.source = 'live';
    expect(panel()).not.toContain('Demo values');
    view.source = 'demo';
    expect(panel({ ...state(), connection: 'disconnected' })).toContain('Demo values');
    expect(renderToStaticMarkup(createElement(CapacityChip))).toContain('chip--demo');
    view.source = 'live';
    expect(renderToStaticMarkup(createElement(CapacityChip))).not.toContain('chip--demo');
  });
  it('does not turn unobserved local usage into zero or claim local provenance', () => {
    const html = panel();
    expect(html).toContain('Unknown requests');
    expect(html).toContain('Unknown tokens');
    expect(html).not.toContain('0 requests');
    expect(html).not.toContain('Locally measured');
  });
});

describe('honest shared capacity lighting', () => {
  it('excludes unconfigured pools and honors each observation lifetime without inferring recovery', () => {
    const disabled = Object.assign(capacity({ id: 'disabled', availability: { value: 'available', provenance: 'provider_reported' } }), { configured: false });
    const shortLived = Object.assign(capacity({ lastCheckedAt: 99_000 }), { maxAgeMs: 500 });
    expect(capacityOut(state(capacity(), disabled))).toBe(true);
    expect(capacityOut(state(disabled))).toBe(false);
    expect(capacityOut(state(shortLived))).toBe(false);
    expect(capacityOut(state(capacity({ resetAt: { value: 90_000, provenance: 'provider_reported' } })))).toBe(true);
    expect(capacityOut(state(capacity(), capacity({ id: 'gemini', availability: { value: 'available', provenance: 'provider_reported' } })))).toBe(false);
    expect(capacityOut(state(capacity({ availability: { value: 'unavailable', provenance: 'estimated' } })))).toBe(false);
    expect(capacityOut(state(capacity({ lastCheckedAt: 100_001 })))).toBe(false);
  });
  it('never treats stale, unobserved, or unknown-provenance unavailability as exhausted', () => {
    expect(capacityOut(state(capacity({ lastCheckedAt: 0 })))).toBe(false);
    expect(capacityOut(state(capacity({ lastCheckedAt: null })))).toBe(false);
    expect(capacityOut(state(capacity({ availability: { value: 'unavailable', provenance: 'unknown' } })))).toBe(false);
    expect(capacityOut(state(capacity()))).toBe(true);
  });
});
