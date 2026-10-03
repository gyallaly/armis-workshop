import { useSyncExternalStore } from 'react';
import { type AdapterSink, type WorkshopAdapter } from '../adapters/adapter';
import { LiveAdapter } from '../adapters/live/liveAdapter';
import { DemoAdapter } from '../adapters/demo/demoAdapter';
import { configuredBridgeUrl, LiveBridgeAdapter } from '../adapters/live';
import type { ScenarioId } from '../adapters/demo/sim';
import { ROSTER } from '../core/config';
import { type Action, initialState, reduce } from '../core/reducer';
import type { RedirectRequest, TrafficDot, Worker, WorkshopState } from '../core/types';

// ------------------------------------------------------------ persistence

const PREFS_KEY = 'armis-workshop.prefs.v1';
const ROSTER_KEY = 'armis-workshop.demo.roster.v2';

export interface Prefs {
  source: 'demo' | 'live';
  scenario: ScenarioId;
  speed: number;
  motion: 'system' | 'full' | 'reduced';
  taskFlow: boolean;
  minimap: boolean;
  tab: 'activity' | 'tasks' | 'capacity';
}

const DEFAULT_PREFS: Prefs = { source: 'live', scenario: 'steady', speed: 1, motion: 'system', taskFlow: true, minimap: true, tab: 'activity' };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: preferences just don't persist */
  }
}

/**
 * Roster identity persists (names and looks stay stable across reloads);
 * live status never does. Stored entries win over config for appearance and
 * name, but only for ids that still exist in config.
 */
export function loadRoster(): Worker[] {
  let stored: Record<string, Pick<Worker, 'name' | 'appearance'>> = {};
  try {
    stored = JSON.parse(localStorage.getItem(ROSTER_KEY) ?? '{}');
  } catch {
    stored = {};
  }
  const roster = ROSTER.map((w) => (stored[w.id] ? { ...w, appearance: stored[w.id]!.appearance } : w));
  save(ROSTER_KEY, Object.fromEntries(roster.map((w) => [w.id, { name: w.name, appearance: w.appearance }])));
  return roster;
}

// -------------------------------------------------------------- UI store

export type View = { mode: 'campus' } | { mode: 'interior'; businessId: string };
export type Selection =
  | { kind: 'worker'; id: string }
  | { kind: 'task'; id: string }
  | { kind: 'dot'; dot: TrafficDot }
  | { kind: 'building'; id: string }
  | null;

export interface UiState {
  view: View;
  selection: Selection;
  prefs: Prefs;
  follow: boolean;
  redirectFor: { workerId: string; taskId: string } | null;
  evidenceFor: string | null; // task id
  newsFor: string | null; // candidate task id, 'all', or null
  demo: { paused: boolean; speed: number; scenario: ScenarioId; dropping: boolean };
  zoomPercent: number;
  systemReducedMotion: boolean;
}

type Listener = () => void;

class Store<S> {
  private listeners = new Set<Listener>();
  constructor(protected s: S) {}
  get = () => this.s;
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  protected set(next: S) {
    if (next === this.s) return;
    this.s = next;
    for (const l of this.listeners) l();
  }
}

class UiStore extends Store<UiState> {
  update(patch: Partial<UiState>) {
    this.set({ ...this.s, ...patch });
  }
  setPrefs(patch: Partial<Prefs>) {
    const prefs = { ...this.s.prefs, ...patch };
    save(PREFS_KEY, prefs);
    this.set({ ...this.s, prefs });
  }
  select(selection: Selection) {
    this.set({ ...this.s, selection, prefs: selection && this.s.prefs.tab !== 'activity' ? { ...this.s.prefs, tab: 'activity' } : this.s.prefs });
  }
  go(view: View) {
    this.set({ ...this.s, view, selection: null, follow: false });
  }
}

const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

export const ui = new UiStore({
  view: { mode: 'campus' },
  selection: null,
  prefs: { ...load(PREFS_KEY, DEFAULT_PREFS), source: 'live' },
  follow: false,
  redirectFor: null,
  evidenceFor: null,
  newsFor: null,
  demo: { paused: false, speed: 1, scenario: 'steady', dropping: false },
  zoomPercent: 100,
  systemReducedMotion: Boolean(mq?.matches),
});
mq?.addEventListener?.('change', (e) => ui.update({ systemReducedMotion: e.matches }));

export function motionEnabled(s: UiState = ui.get()): boolean {
  if (s.prefs.motion === 'full') return true;
  if (s.prefs.motion === 'reduced') return false;
  return !s.systemReducedMotion;
}

// ---------------------------------------------------------- data store

class WorkshopStore extends Store<WorkshopState> implements AdapterSink {
  adapter: WorkshopAdapter | null = null;
  private roster: Worker[] = [];
  private pending: Action[] = [];
  private flushScheduled = false;
  private sourceGeneration = 0;

  dispatch(a: Action) {
    this.set(reduce(this.s, a));
  }

  /** Batches high-frequency deliveries into one notification per frame. */
  private queue(a: Action) {
    this.pending.push(a);
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    const generation = this.sourceGeneration;
    const flush = () => {
      if (generation !== this.sourceGeneration) return;
      this.flushScheduled = false;
      const list = this.pending;
      this.pending = [];
      let s = this.s;
      for (const x of list) s = reduce(s, x);
      this.set(s);
    };
    if (typeof document !== 'undefined' && document.hidden) setTimeout(flush, 0);
    else requestAnimationFrame(flush);
  }

  snapshot: AdapterSink['snapshot'] = (snapshot, connection) => {
    if (this.adapter?.kind === 'live') this.queue({ kind: 'reset', roster: [], connection, now: snapshot.takenAt });
    this.queue({ kind: 'snapshot', snapshot, connection });
  };
  /** receivedTs is stamped here, on arrival, never trusted from the source. */
  events: AdapterSink['events'] = (events) => {
    const at = Date.now();
    this.queue({ kind: 'events', events: events.map((e) => ({ ...e, receivedTs: at })) });
  };
  connection: AdapterSink['connection'] = (connection) => this.queue({ kind: 'connection', connection });
  tick: AdapterSink['tick'] = (now) => this.queue({ kind: 'tick', now });
  reset: AdapterSink['reset'] = () => this.queue({ kind: 'reset', roster: this.adapter?.kind === 'demo' ? this.roster : [], connection: this.s.connection, now: this.s.now });

  start(source: 'demo' | 'live', prefs: Prefs) {
    this.adapter?.stop();
    this.sourceGeneration++;
    this.pending = []; // nothing from the previous adapter may leak into the new one
    this.flushScheduled = false;
    this.roster = source === 'demo' ? loadRoster() : [];
    ui.update({ selection: null, follow: false, redirectFor: null, evidenceFor: null, newsFor: null });
    const conn = source === 'demo' ? 'demo' : 'disconnected';
    this.set(initialState(this.roster, conn, Date.now()));
    if (source === 'demo') {
      const demo = new DemoAdapter({ seed: 7, scenario: prefs.scenario, speed: prefs.speed });
      demo.subscribe((d) => ui.update({ demo: d }));
      this.adapter = demo;
    } else {
      this.adapter = new LiveAdapter();
    }
    const generation = this.sourceGeneration;
    const guarded: AdapterSink = {
      snapshot: (...a) => { if (generation === this.sourceGeneration) this.snapshot(...a); },
      events: (...a) => { if (generation === this.sourceGeneration) this.events(...a); },
      connection: (...a) => { if (generation === this.sourceGeneration) this.connection(...a); },
      tick: (...a) => { if (generation === this.sourceGeneration) this.tick(...a); },
      reset: () => { if (generation === this.sourceGeneration) this.reset(); },
    };
    this.adapter.start(guarded);
  }

  get demo(): DemoAdapter | null {
    return this.adapter instanceof DemoAdapter ? this.adapter : null;
  }

  redirect(workerId: string, taskId: string, instruction: string): { ok: boolean; reason?: string; id?: string } {
    const adapter = this.adapter;
    if (!adapter || !adapter.capabilities.redirect) return { ok: false, reason: 'Redirect is unavailable: live bridge not connected.' };
    const st = this.s.statuses[workerId];
    const req: RedirectRequest = {
      id: `rd-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
      workerId,
      taskId,
      attemptId: st?.taskId === taskId ? st.attemptId : undefined,
      instruction: instruction.trim(),
      state: 'requested',
      simulated: adapter.kind === 'demo',
      history: [{ state: 'requested', at: this.s.now }],
    };
    const res = adapter.requestRedirect(req);
    if (!res.accepted) return { ok: false, reason: res.reason };
    this.dispatch({ kind: 'redirect.request', request: req });
    return { ok: true, id: req.id };
  }
}

export const store = new WorkshopStore(initialState([], 'disconnected', 0));

export function useWorkshop<T>(sel: (s: WorkshopState) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(store.get()));
}

export function useUi<T>(sel: (s: UiState) => T): T {
  return useSyncExternalStore(ui.subscribe, () => sel(ui.get()));
}
