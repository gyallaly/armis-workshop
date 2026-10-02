import { Rng } from '../../core/rng';
import type { ActivityEvent, Millis, RedirectRequest } from '../../core/types';
import type { AdapterSink, RedirectResult, WorkshopAdapter } from '../adapter';
import { DemoSim, SCENARIOS, type ScenarioId } from './sim';

export interface DemoOptions {
  seed?: number;
  scenario?: ScenarioId;
  speed?: number;
  paused?: boolean;
}

export type DemoListener = (s: { paused: boolean; speed: number; scenario: ScenarioId; dropping: boolean }) => void;

/**
 * Plays a DemoSim in (scaled) real time and delivers its events with realistic
 * stream imperfections - occasional duplicates and late heartbeats - so the
 * reducer's de-duplication and ordering rules are exercised constantly.
 */
export class DemoAdapter implements WorkshopAdapter {
  readonly kind = 'demo' as const;
  readonly label = 'Demo data (simulated)';
  readonly capabilities = { redirect: true, controls: true };

  private sim!: DemoSim;
  private sink: AdapterSink | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastReal = 0;
  private lastTick = 0;
  private quirks!: Rng;
  private carry: ActivityEvent[] = [];
  private dropUntil: Millis | null = null;
  private outages: { at: Millis; end: Millis }[] = [];
  private listeners = new Set<DemoListener>();

  seed: number;
  scenario: ScenarioId;
  speed: number;
  paused: boolean;

  constructor(opts: DemoOptions = {}) {
    this.seed = opts.seed ?? 7;
    this.scenario = opts.scenario ?? 'steady';
    this.speed = opts.speed ?? 1;
    this.paused = opts.paused ?? false;
  }

  start(sink: AdapterSink): void {
    this.sink = sink;
    this.boot();
    this.schedule();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.sink = null;
  }

  private onVisibility = () => this.schedule();

  /** Hidden tabs step once a second; visible tabs ten times a second. */
  private schedule() {
    if (this.timer) clearInterval(this.timer);
    const hidden = typeof document !== 'undefined' && document.hidden;
    this.lastReal = performance.now();
    this.timer = setInterval(() => this.step(), hidden ? 1000 : 100);
  }

  private boot() {
    this.sim = new DemoSim(this.seed, this.scenario);
    this.quirks = new Rng(this.seed ^ 0x5bd1e995);
    this.carry = [];
    this.dropUntil = null;
    this.wasDropping = false;
    this.sim.advanceTo(this.sim.loadAt); // warm-up runs silently
    const scenario = SCENARIOS.find((s) => s.id === this.scenario)!;
    this.outages = scenario.outages.map((o) => ({ at: this.sim.loadAt + o.at, end: this.sim.loadAt + o.at + o.durationMs }));
    this.lastReal = performance.now();
    this.sink?.reset();
    this.sink?.snapshot(this.sim.snapshot(), 'demo');
    this.sink?.tick(this.sim.t);
    this.notify();
  }

  private step() {
    const real = performance.now();
    const dt = Math.min(2000, real - this.lastReal);
    this.lastReal = real;
    if (this.paused || !this.sink) return;
    const target = this.sim.t + dt * this.speed;
    const events = this.sim.advanceTo(target);
    this.deliver(events);
    if (real - this.lastTick > 250) {
      this.lastTick = real;
      this.sink.tick(this.sim.t);
    }
  }

  private deliver(events: ActivityEvent[]) {
    const sink = this.sink!;
    const now = this.sim.t;
    // Scripted and manual stream drops.
    const outage = this.outages.find((o) => now >= o.at && now < o.end);
    const dropping = (this.dropUntil !== null && now < this.dropUntil) || Boolean(outage);
    if (dropping) {
      if (!this.wasDropping) {
        this.wasDropping = true;
        sink.connection('reconnecting');
        this.notify();
      }
      return; // events during an outage are lost; the reconnect snapshot covers them
    }
    if (this.wasDropping) {
      this.wasDropping = false;
      this.dropUntil = null;
      this.carry = [];
      sink.snapshot(this.sim.snapshot(), 'demo');
      this.notify();
      return;
    }
    const batch = this.carry;
    this.carry = [];
    for (const e of events) {
      const r = this.quirks.next();
      if (e.type === 'worker.heartbeat' && r < 0.15) {
        this.carry.push(e); // late: arrives after newer events
        continue;
      }
      batch.push(e);
      if (r > 0.94) this.carry.push(e); // duplicate delivery
    }
    if (batch.length) sink.events(batch);
  }

  private wasDropping = false;

  clock(): Millis {
    if (!this.sim) return 0;
    if (this.paused) return this.sim.t;
    return this.sim.t + Math.min(250, performance.now() - this.lastReal) * this.speed;
  }

  requestRedirect(request: RedirectRequest): RedirectResult {
    if (this.paused) return { accepted: false, reason: 'Demo is paused - resume to see the simulated acknowledgement.' };
    if (!request.instruction.trim()) return { accepted: false, reason: 'Instruction is empty.' };
    this.sim.redirect(request);
    return { accepted: true };
  }

  // ------------------------------------------------------------- controls

  subscribe(fn: DemoListener): () => void {
    this.listeners.add(fn);
    fn(this.status());
    return () => this.listeners.delete(fn);
  }

  status() {
    return { paused: this.paused, speed: this.speed, scenario: this.scenario, dropping: this.wasDropping };
  }

  private notify() {
    const s = this.status();
    for (const l of this.listeners) l(s);
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.lastReal = performance.now();
    this.notify();
  }

  setSpeed(speed: number) {
    this.speed = speed;
    this.notify();
  }

  setScenario(id: ScenarioId) {
    this.scenario = id;
    this.reset();
  }

  /** Replays the scenario from the start with the same seed (repeatable). */
  reset() {
    this.boot();
  }

  /** Simulates a stream drop of `ms` source-milliseconds. */
  simulateDrop(ms = 20_000) {
    this.dropUntil = this.sim.t + ms;
  }

  /** Sim time at which the scenario was loaded, for countdown displays. */
  get loadAt(): Millis {
    return this.sim?.loadAt ?? 0;
  }
}
