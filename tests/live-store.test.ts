import { expect, it, vi } from 'vitest';
import { ROSTER } from '../src/core/config';
vi.stubGlobal('document', { hidden: false, addEventListener() {}, removeEventListener() {} });
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
vi.stubGlobal('requestAnimationFrame', (f: () => void) => { f(); return 1; });
const { store, ui } = await import('../src/ui/store');
it('Demo redirect flows through the adapter and store without losing acknowledgements', () => {
  vi.useFakeTimers({toFake:['setInterval','clearInterval','setTimeout','clearTimeout','performance']});
  try {
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => setTimeout(f, 16));
    store.start('demo', ui.get().prefs);
    vi.advanceTimersByTime(32);
    const status = Object.values(store.get().statuses).find(s => s.state === 'active' && s.taskId)!;
    const result = store.redirect(status.workerId, status.taskId!, 'Check keyboard navigation first.');
    expect(result.ok).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(store.get().redirects[result.id!]?.state).toBe('acknowledged');
  } finally {store.adapter?.stop();vi.useRealTimers();vi.stubGlobal('requestAnimationFrame', (f: () => void) => {f();return 1;});}
});
it('switching to Live discards all Demo identity, tasks, capacity, artifacts, traffic and paper positions', () => {
  vi.stubGlobal('EventSource', class { addEventListener() {} close() {} });
  store.start('demo', ui.get().prefs);
  expect(Object.keys(store.get().workers).length).toBe(ROSTER.length);
  store.start('live', ui.get().prefs);
  const s = store.get();
  for (const key of ['workers','tasks','capacity','artifacts','ledger','attempts','statuses']) expect(s[key as keyof typeof s]).toEqual({});
  expect(s.traffic).toEqual([]);
  expect(store.adapter?.capabilities).toEqual({ redirect: false, controls: false });
  store.adapter?.stop();
});
it('Live snapshots replace identity, and callbacks from a stopped source are ignored', () => {
  vi.stubGlobal('EventSource', class { addEventListener() {} close() {} });
  store.start('live', ui.get().prefs);
  const old = store.adapter!;
  store.snapshot({ takenAt: Date.now(), workers: [ROSTER[0]!], statuses: [], tasks: [], attempts: [], artifacts: [], capacity: [] }, 'connected');
  store.snapshot({ takenAt: Date.now(), workers: [], statuses: [], tasks: [], attempts: [], artifacts: [], capacity: [] }, 'connected');
  expect(store.get().workers).toEqual({});
  old.stop();
  store.start('demo', ui.get().prefs);
  expect(Object.keys(store.get().workers).length).toBe(ROSTER.length);
  store.adapter?.stop();
});
