import { BUSINESS_BY_ID, ROSTER, TRADING_BUSINESSES, departmentForStage, loungeOf } from '../../core/config';
import { applyEvent, initialState } from '../../core/reducer';
import { Rng } from '../../core/rng';
import type {
  ActivityEvent,
  ActivityEventType,
  Availability,
  Millis,
  ProviderCapacity,
  ProviderRef,
  Provenance,
  RedirectRequest,
  Snapshot,
  Task,
  TaskStage,
  WorkshopState,
} from '../../core/types';
import { ACTIONS, FINDINGS, TASKS, artifactPreview, type TaskTemplate } from './content';
import { CANDIDATES, LedgerModel, type LedgerScenario, TRADERS } from './ledger';

/**
 * Deterministic discrete-event simulation behind the demo adapter.
 *
 * Every decision draws from one seeded RNG in strict time order (ties broken
 * by insertion sequence), so `advanceTo(T)` yields the same events no matter
 * how the real-time loop chunks the calls. The simulation keeps its own
 * "truth" by running the same reducer the viewer uses, which is also how a
 * reconnect snapshot is produced.
 *
 * This is an aspirational multi-worker picture. The documented Uditus workshop
 * runs create -> review -> repair serialized with bounded repair; this demo
 * does not claim the current deployment runs this many workers.
 */

export const DEMO_EPOCH = Date.UTC(2026, 9, 2, 21, 30, 0);
export const WARMUP_MS = 45_000;

export type ScenarioId =
  | 'steady'
  | 'codex-reset'
  | 'all-unavailable'
  | 'reconnect'
  | 'ledger-stale-quotes'
  | 'ledger-conflicting'
  | 'ledger-failed-audit'
  | 'ledger-no-opportunity'
  | 'ledger-provider-out';

export interface Scenario {
  id: ScenarioId;
  label: string;
  description: string;
  /** Simulated stream outages, relative to load time. */
  outages: { at: number; durationMs: number }[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'steady',
    label: 'Steady evening',
    description: 'Codex limited (provider-reported), Gemini available with remaining allowance not reported.',
    outages: [],
  },
  {
    id: 'codex-reset',
    label: 'Codex out until reset',
    description: 'Codex returns 429 until a simulated reset; Gemini picks up eligible work, Codex-only work waits.',
    outages: [],
  },
  {
    id: 'all-unavailable',
    label: 'Both providers out',
    description: 'Codex and Gemini both unavailable; work stays queued. Gemini gives no reset hint.',
    outages: [],
  },
  {
    id: 'reconnect',
    label: 'Stream drop + reconnect',
    description: 'The event stream drops for 25 s; workers go stale, then a reconnect snapshot restores state.',
    outages: [{ at: 50_000, durationMs: 25_000 }],
  },
  { id: 'ledger-stale-quotes', label: 'Ledger: stale quotes', description: 'Aster Ledger venue quotes go stale; audit rejects candidates it cannot price.', outages: [] },
  { id: 'ledger-conflicting', label: 'Ledger: conflicting sources', description: 'Aster Ledger news contradicts itself; rules rejects candidates.', outages: [] },
  { id: 'ledger-failed-audit', label: 'Ledger: failed audit', description: 'Aster Ledger audit catches a mis-cited primary source and rejects.', outages: [] },
  { id: 'ledger-provider-out', label: 'Ledger: provider unavailable', description: 'Codex and Gemini both out; Aster Ledger candidates wait for capacity and nothing is decided until capacity resets.', outages: [] },
  { id: 'ledger-no-opportunity', label: 'Ledger: no eligible opportunity', description: 'Aster Ledger candidates all clear checks but none clears the edge threshold.', outages: [] },
];

function ledgerScenario(id: ScenarioId): LedgerScenario {
  return id === 'ledger-stale-quotes'
    ? 'stale-quotes'
    : id === 'ledger-conflicting'
      ? 'conflicting'
      : id === 'ledger-failed-audit'
        ? 'failed-audit'
        : id === 'ledger-no-opportunity'
          ? 'no-opportunity'
          : 'normal';
}

interface CapModel {
  id: string;
  provider: string;
  scope: ProviderCapacity['scope'];
  models: string[];
  availability: Availability;
  availabilityProv: Provenance;
  availabilityNote?: string;
  remaining: number | null;
  remainingProv: Provenance;
  remainingNote?: string;
  unit: 'requests' | 'tokens';
  resetAt: Millis | null;
  resetProv: Provenance;
  requests: number;
  tokens: number;
  fallback?: string;
  fallbackNote?: string;
  lastCheckedAt: Millis | null;
}

interface Run {
  attemptId: string;
  sessionId: string;
  taskId: string;
  workerId: string;
  businessId: string;
  stage: TaskStage;
  capId: string;
  steps: number;
  done: number;
  stepMs: number;
  waiting: boolean;
  willFail: boolean;
}

const STAGE_MS: Record<string, [number, number]> = {
  feeds: [10_000, 16_000],
  rules: [12_000, 18_000],
  trader_watch: [20_000, 30_000],
  portfolio: [10_000, 14_000],
  research: [22_000, 32_000],
  creation: [28_000, 42_000],
  audit: [18_000, 26_000],
  fixes: [15_000, 24_000],
};

const WORK_STAGES: TaskStage[] = ['audit', 'fixes', 'creation', 'research'];
const LEDGER_STAGES: TaskStage[] = ['portfolio', 'audit', 'rules', 'research', 'feeds', 'trader_watch'];
const LEDGER_CRITERIA = ['Primary source identified', 'Contract rules match the thesis', 'Executable quote fresh (< 60 s)', 'Edge clears threshold after fees'];

export class DemoSim {
  readonly seed: number;
  readonly scenario: Scenario;
  readonly loadAt = DEMO_EPOCH + WARMUP_MS;
  t: Millis = DEMO_EPOCH;
  truth: WorkshopState;

  private rng: Rng;
  private queue: { at: Millis; seq: number; fn: () => void }[] = [];
  private seq = 0;
  private n = 0;
  private out: ActivityEvent[] = [];
  private caps: Record<string, CapModel> = {};
  private busy = new Set<string>();
  private runs = new Map<string, Run>();
  private templates = new Map<string, TaskTemplate>();
  private nextTemplate: Record<string, number> = {};
  private online = new Set<string>();
  private failuresLeft: Record<string, number> = { uditus: 1, 'etsy-studio': 1 };
  readonly ledger: LedgerModel;
  private ledgerAudits = 0;

  constructor(seed = 7, scenarioId: ScenarioId = 'steady') {
    this.seed = seed;
    this.scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]!;
    this.rng = new Rng(seed * 7919 + this.scenario.id.length * 104729);
    this.truth = initialState(ROSTER, 'demo', DEMO_EPOCH);
    // Aster Ledger has its own RNG stream so its data stays isolated from the other businesses.
    this.ledger = new LedgerModel(DEMO_EPOCH, ledgerScenario(this.scenario.id), new Rng(seed * 31 + 7));
    this.setup();
  }

  // ------------------------------------------------------------ scheduling

  private at(time: Millis, fn: () => void) {
    const item = { at: time, seq: this.seq++, fn };
    let i = this.queue.length;
    while (i > 0) {
      const q = this.queue[i - 1]!;
      if (q.at < item.at || (q.at === item.at && q.seq < item.seq)) break;
      i--;
    }
    this.queue.splice(i, 0, item);
  }

  private after(ms: number, fn: () => void) {
    this.at(this.t + ms, fn);
  }

  advanceTo(target: Millis): ActivityEvent[] {
    // The wire contract is integer epoch milliseconds. Browser frame clocks
    // have fractional deltas; quantize at the clock boundary, not validation.
    target = Math.floor(target);
    while (this.queue.length && this.queue[0]!.at <= target) {
      const item = this.queue.shift()!;
      this.t = item.at;
      item.fn();
    }
    this.t = Math.max(this.t, target);
    this.truth = { ...this.truth, now: this.t };
    const out = this.out;
    this.out = [];
    return out;
  }

  private emit(
    type: ActivityEventType,
    ids: { businessId: string; workerId?: string; taskId?: string; attemptId?: string; sessionId?: string },
    payload: Record<string, unknown> = {},
    sourceTs: Millis = this.t,
  ) {
    const e: ActivityEvent = {
      id: `demo-${this.seed}-${this.scenario.id}-${++this.n}`,
      type,
      sourceTs,
      receivedTs: sourceTs + 40 + ((this.n * 37) % 260),
      ...ids,
      payload,
    };
    this.truth = applyEvent(this.truth, e);
    this.out.push(e);
  }

  // ----------------------------------------------------------------- setup

  private setup() {
    const t0 = DEMO_EPOCH;
    this.initCaps();
    for (const c of Object.values(this.caps)) this.emitCap(c);

    for (const w of ROSTER) {
      if (w.id === 'w-pip') continue; // unknown until first heard from
      if (w.id === 'w-oak') {
        this.emit('worker.state', { businessId: w.businessId, workerId: w.id }, { state: 'offline', departmentId: w.homeDepartmentId });
        continue;
      }
      this.online.add(w.id);
      this.emit('worker.state', { businessId: w.businessId, workerId: w.id }, { state: 'idle', departmentId: loungeOf(w.businessId) });
    }

    // Existing work in flight when the viewer "connects".
    this.createTask('uditus', 'creation');
    this.createTask('uditus', 'audit');
    this.createTask('uditus', 'research');
    this.createTask('etsy-studio', 'creation');
    this.createTask('etsy-studio', 'research');
    this.emitLedger();
    this.createLedgerTask('research');
    this.createLedgerTask('feeds');
    this.createLedgerTask('rules');
    this.createTraderTask();
    this.at(t0 + 300, () => this.assignLoop('aster-ledger'));
    this.at(t0 + 12_000, () => this.ledgerCreationLoop());
    this.at(t0 + 9_000, () => this.ledgerTickLoop());

    for (const biz of ['uditus', 'etsy-studio']) {
      this.at(t0 + 500, () => this.assignLoop(biz));
      this.at(t0 + 20_000 + this.rng.int(0, 15_000), () => this.creationLoop(biz));
    }
    this.at(t0 + 4000, () => this.pollLoop());
    this.at(t0 + 7000, () => this.heartbeatLoop());

    // Pip has no observed status at load; first heard from 40 s later.
    this.at(this.loadAt + 40_000, () => {
      this.emit('worker.heartbeat', { businessId: 'uditus', workerId: 'w-pip' });
      this.online.add('w-pip');
      this.emit('worker.state', { businessId: 'uditus', workerId: 'w-pip' }, { state: 'idle', departmentId: loungeOf('uditus') });
    });
    // Oak comes back online later; Etsy fixes wait until then.
    this.at(this.loadAt + 150_000, () => {
      this.online.add('w-oak');
      this.emit('worker.state', { businessId: 'etsy-studio', workerId: 'w-oak' }, { state: 'idle', departmentId: loungeOf('etsy-studio') });
    });

    this.scriptCapacity();
  }

  private initCaps() {
    const t0 = DEMO_EPOCH;
    this.caps['cap-codex'] = {
      id: 'cap-codex',
      provider: 'Codex',
      scope: { kind: 'account', label: 'Demo account (shared)' },
      models: ['codex-demo-large', 'codex-demo-mini'],
      availability: 'limited',
      availabilityProv: 'provider_reported',
      availabilityNote: 'Rate-limit headers (simulated)',
      remaining: 140,
      remainingProv: 'provider_reported',
      remainingNote: 'x-ratelimit-remaining (simulated)',
      unit: 'requests',
      resetAt: t0 + 40 * 60_000,
      resetProv: 'provider_reported',
      requests: 0,
      tokens: 0,
      fallback: 'cap-gemini',
      fallbackNote: 'Eligible tasks only',
      lastCheckedAt: t0,
    };
    this.caps['cap-gemini'] = {
      id: 'cap-gemini',
      provider: 'Gemini',
      scope: { kind: 'project', label: 'demo-project (shared)' },
      models: ['gemini-demo-pro', 'gemini-demo-flash'],
      availability: 'available',
      availabilityProv: 'locally_measured',
      availabilityNote: 'Recent requests succeeded (says nothing about remaining quota)',
      remaining: null,
      remainingProv: 'unknown',
      remainingNote: 'Provider does not report remaining allowance for this scope',
      unit: 'requests',
      resetAt: null,
      resetProv: 'unknown',
      requests: 0,
      tokens: 0,
      lastCheckedAt: t0,
    };
  }

  private scriptCapacity() {
    const t0 = DEMO_EPOCH;
    const id = this.scenario.id;
    if (id === 'codex-reset' || id === 'all-unavailable' || id === 'ledger-provider-out') {
      const resetAt = this.loadAt + (id === 'codex-reset' ? 180_000 : 300_000);
      void 0;
      this.at(t0 + 20_000, () => {
        Object.assign(this.caps['cap-codex']!, {
          availability: 'unavailable',
          availabilityProv: 'provider_reported',
          availabilityNote: 'HTTP 429 usage limit reached (simulated)',
          remaining: 0,
          remainingProv: 'provider_reported',
          resetAt,
          resetProv: 'provider_reported',
          lastCheckedAt: this.t,
        });
        this.emitCap(this.caps['cap-codex']!);
      });
      this.at(resetAt, () => {
        Object.assign(this.caps['cap-codex']!, {
          availability: 'available',
          availabilityProv: 'provider_reported',
          availabilityNote: 'Usage window reset (simulated)',
          remaining: 500,
          remainingProv: 'provider_reported',
          resetAt: this.t + 5 * 3600_000,
          resetProv: 'provider_reported',
          lastCheckedAt: this.t,
        });
        this.emitCap(this.caps['cap-codex']!);
      });
    }
    if (id === 'all-unavailable' || id === 'ledger-provider-out') {
      this.at(t0 + 20_000, () => {
        Object.assign(this.caps['cap-gemini']!, {
          availability: 'unavailable',
          availabilityProv: 'provider_reported',
          availabilityNote: 'HTTP 429 without a reset hint (simulated)',
          remaining: null,
          remainingProv: 'unknown',
          resetAt: null,
          resetProv: 'unknown',
          lastCheckedAt: this.t,
        });
        this.emitCap(this.caps['cap-gemini']!);
      });
      this.at(this.loadAt + 420_000, () => {
        Object.assign(this.caps['cap-gemini']!, {
          availability: 'available',
          availabilityProv: 'locally_measured',
          availabilityNote: 'Requests succeeding again (says nothing about remaining quota)',
          lastCheckedAt: this.t,
        });
        this.emitCap(this.caps['cap-gemini']!);
      });
    }
  }

  private capOf(c: CapModel): ProviderCapacity {
    return {
      id: c.id,
      provider: c.provider,
      scope: c.scope,
      models: c.models,
      modelsIllustrative: true,
      availability: { value: c.availability, provenance: c.availabilityProv, note: c.availabilityNote },
      remaining: { value: c.remaining, provenance: c.remainingProv, note: c.remainingNote, unit: c.unit },
      resetAt: { value: c.resetAt, provenance: c.resetProv },
      local: {
        requests: { value: c.requests, provenance: 'locally_measured' },
        tokens: { value: c.tokens, provenance: 'locally_measured' },
        windowLabel: 'since viewer connected',
      },
      fallbackCapacityId: c.fallback,
      fallbackNote: c.fallbackNote,
      lastCheckedAt: c.lastCheckedAt,
    };
  }

  private emitCap(c: CapModel) {
    this.emit('capacity.updated', { businessId: 'hermes-hq' }, { capacity: this.capOf(c) });
  }

  private usable(capId: string): boolean {
    const a = this.caps[capId]?.availability;
    return a === 'available' || a === 'limited';
  }

  // ----------------------------------------------------------------- loops

  private creationLoop(biz: string) {
    const open = Object.values(this.truth.tasks).filter(
      (t) => t.businessId === biz && t.status !== 'ready' && t.status !== 'held',
    ).length;
    if (open < 6) {
      const hermes = 'w-hermes';
      this.emit('worker.state', { businessId: 'hermes-hq', workerId: hermes }, {
        state: 'active',
        departmentId: 'hermes-hq:dispatch',
        action: `Routing new work to ${BUSINESS_BY_ID[biz]?.brand.displayName}`,
      });
      const id = this.createTask(biz, 'research');
      this.emit('task.handoff', { businessId: biz, taskId: id }, { from: 'hq', to: 'research', outcome: 'dispatched', durationMs: 7000 });
      this.after(4000, () =>
        this.emit('worker.state', { businessId: 'hermes-hq', workerId: hermes }, { state: 'idle', departmentId: 'hermes-hq:lounge' }),
      );
    }
    this.after(this.rng.int(45_000, 75_000), () => this.creationLoop(biz));
  }

  // ------------------------------------------------------ Aster Ledger

  private emitLedger() {
    this.emit('ledger.updated', { businessId: 'aster-ledger' }, { book: this.ledger.snapshot() });
  }

  private createLedgerTask(stage: TaskStage): string {
    const k = this.nextTemplate['aster-ledger'] ?? 0;
    this.nextTemplate['aster-ledger'] = k + 1;
    const tpl = CANDIDATES[k % CANDIDATES.length]!;
    const id = `cand-${k + 1}`;
    this.templates.set(id, { title: tpl.question, criteria: LEDGER_CRITERIA, eligible: ['cap-gemini', 'cap-codex'] });
    this.ledger.addCandidate(id, k, this.t);
    if (stage !== 'feeds') this.ledger.research(id, this.t);
    this.emit('task.created', { businessId: 'aster-ledger', taskId: id }, {
      title: k >= CANDIDATES.length ? `${tpl.question} #${Math.floor(k / CANDIDATES.length) + 1}` : tpl.question,
      criteria: LEDGER_CRITERIA,
      stage,
      eligibleCapacity: ['cap-gemini', 'cap-codex'],
      maxRepairs: 0,
    });
    this.emitLedger();
    return id;
  }

  private createTraderTask(): string {
    const k = this.nextTemplate['aster-traders'] ?? 0;
    this.nextTemplate['aster-traders'] = k + 1;
    const handle = TRADERS[k % TRADERS.length]!;
    const id = `trader-${k + 1}`;
    const criteria = ['Public sources only', 'Claims marked unverified', 'Summary dated'];
    this.templates.set(id, { title: `Public trader summary: ${handle}`, criteria, eligible: ['cap-gemini', 'cap-codex'] });
    this.emit('task.created', { businessId: 'aster-ledger', taskId: id }, {
      title: `Public trader summary: ${handle} (illustrative)`,
      criteria,
      stage: 'trader_watch',
      eligibleCapacity: ['cap-gemini', 'cap-codex'],
      maxRepairs: 0,
    });
    return id;
  }

  private ledgerCreationLoop() {
    const open = Object.values(this.truth.tasks).filter((t) => t.businessId === 'aster-ledger' && !['ready', 'rejected', 'held'].includes(t.status)).length;
    if (open < 7) {
      this.emit('worker.state', { businessId: 'hermes-hq', workerId: 'w-hermes' }, { state: 'active', departmentId: 'hermes-hq:dispatch', action: 'Routing a new candidate to Aster Ledger' });
      const id = this.createLedgerTask('feeds');
      this.emit('task.handoff', { businessId: 'aster-ledger', taskId: id }, { from: 'hq', to: 'feeds', outcome: 'dispatched', durationMs: 7000 });
      this.after(4000, () => this.emit('worker.state', { businessId: 'hermes-hq', workerId: 'w-hermes' }, { state: 'idle', departmentId: 'hermes-hq:lounge' }));
      if ((this.nextTemplate['aster-ledger'] ?? 0) % 3 === 0) this.createTraderTask();
    }
    this.after(this.rng.int(30_000, 48_000), () => this.ledgerCreationLoop());
  }

  private ledgerTickLoop() {
    this.ledger.tick(this.t);
    this.emitLedger();
    this.after(15_000, () => this.ledgerTickLoop());
  }

  private finishLedger(run: Run) {
    const ids = this.ids(run);
    const t = this.t;
    const handoff = (to: TaskStage, outcome = 'handoff') => this.emit('task.handoff', ids, { from: run.stage, to, outcome, durationMs: 6000 });
    const reject = (reason: string) => {
      this.ledger.reject(run.taskId, t, reason);
      this.emit('attempt.finished', ids, { outcome: 'failed' });
      handoff('rejected', 'rejected');
      this.emit('task.status', ids, { status: 'rejected', reason });
    };
    this.record(run);
    switch (run.stage) {
      case 'feeds':
        this.emit('attempt.finished', ids, { outcome: 'completed' });
        handoff('research');
        break;
      case 'research':
        this.ledger.research(run.taskId, t);
        this.emit('attempt.finished', ids, { outcome: 'completed' });
        handoff('rules');
        break;
      case 'rules': {
        const why = this.ledger.rules(run.taskId, t);
        if (why) reject(why);
        else {
          this.emit('attempt.finished', ids, { outcome: 'passed' });
          handoff('audit');
        }
        break;
      }
      case 'audit': {
        this.ledgerAudits++;
        const forced = this.scenario.id === 'ledger-failed-audit' ? this.ledgerAudits <= 3 || this.rng.chance(0.5) : this.rng.chance(0.12);
        const why = this.ledger.audit(run.taskId, t, forced);
        if (why) {
          this.emit('audit.findings', ids, { findings: [{ id: `f-${run.taskId}`, severity: 'serious', summary: why, resolved: false }] });
          reject(why);
        } else {
          this.emit('attempt.finished', ids, { outcome: 'passed' });
          handoff('portfolio');
        }
        break;
      }
      case 'portfolio': {
        const d = this.ledger.decide(run.taskId, t);
        this.emit('attempt.finished', ids, { outcome: 'completed' });
        if (d.entry) {
          handoff('ready', 'ready');
          this.emit('task.ready', ids, {});
        } else {
          handoff('rejected', 'rejected');
          this.emit('task.status', ids, { status: 'rejected', reason: d.reason });
        }
        break;
      }
      case 'trader_watch': {
        const handle = this.truth.tasks[run.taskId]?.title.split(': ')[1]?.replace(' (illustrative)', '') ?? '@unknown';
        this.ledger.addTrader(handle, t);
        this.emit('attempt.finished', ids, { outcome: 'completed' });
        handoff('ready', 'ready');
        this.emit('task.ready', ids, {});
        break;
      }
    }
    this.emitLedger();
    this.release(run);
  }

  private createTask(biz: string, stage: TaskStage): string {
    const list = TASKS[biz]!;
    const k = this.nextTemplate[biz] ?? 0;
    this.nextTemplate[biz] = k + 1;
    const tpl = list[k % list.length]!;
    const id = `task-${biz}-${k + 1}`;
    this.templates.set(id, tpl);
    this.emit('task.created', { businessId: biz, taskId: id }, {
      title: k >= list.length ? `${tpl.title} (#${Math.floor(k / list.length) + 1})` : tpl.title,
      criteria: tpl.criteria,
      stage,
      eligibleCapacity: tpl.eligible,
      maxRepairs: 2,
    });
    return id;
  }

  private pollLoop() {
    const echo = 'w-echo';
    this.emit('worker.state', { businessId: 'hermes-hq', workerId: echo }, {
      state: 'active',
      departmentId: 'hermes-hq:capacity',
      action: 'Checking provider status (simulated - no provider is called)',
    });
    for (const c of Object.values(this.caps)) {
      c.lastCheckedAt = this.t;
      this.emitCap(c);
    }
    this.after(3500, () =>
      this.emit('worker.state', { businessId: 'hermes-hq', workerId: echo }, { state: 'idle', departmentId: 'hermes-hq:lounge' }),
    );
    this.after(20_000, () => this.pollLoop());
  }

  private heartbeatLoop() {
    for (const w of ROSTER) {
      if (!this.online.has(w.id)) continue;
      this.emit('worker.heartbeat', { businessId: w.businessId, workerId: w.id });
    }
    this.after(15_000, () => this.heartbeatLoop());
  }

  private assignLoop(biz: string) {
    for (const stage of TRADING_BUSINESSES.has(biz) ? LEDGER_STAGES : WORK_STAGES) {
      const tasks = Object.values(this.truth.tasks)
        .filter((t) => t.businessId === biz && t.stage === stage && (t.status === 'queued' || (t.status === 'waiting_provider' && !t.assignedWorkerId)))
        .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
      for (const task of tasks) {
        const capId = task.eligibleCapacity.find((c) => this.usable(c));
        if (!capId) {
          if (task.status !== 'waiting_provider') {
            const names = task.eligibleCapacity.map((c) => this.caps[c]?.provider ?? c).join(' / ');
            this.emit('task.status', { businessId: biz, taskId: task.id }, {
              status: 'waiting_provider',
              reason: `No eligible capacity (${names} unavailable)`,
            });
          }
          continue;
        }
        const worker = ROSTER.find(
          (w) =>
            w.businessId === biz &&
            w.homeDepartmentId === departmentForStage(biz, stage) &&
            this.online.has(w.id) &&
            !this.busy.has(w.id) &&
            this.truth.statuses[w.id]?.state === 'idle',
        );
        if (!worker) continue;
        this.startAttempt(task, worker.id, capId);
      }
    }
    this.after(2000, () => this.assignLoop(biz));
  }

  // -------------------------------------------------------------- attempts

  private providerRef(capId: string): ProviderRef {
    const c = this.caps[capId]!;
    return { provider: c.provider, model: c.models[0], capacityId: c.id, modelProvenance: 'provider_reported' };
  }

  private startAttempt(task: Task, workerId: string, capId: string) {
    const stage = task.stage;
    const [lo, hi] = STAGE_MS[stage] ?? [20_000, 30_000];
    const steps = this.rng.int(3, 4);
    const run: Run = {
      attemptId: `att-${this.seed}-${++this.n}`,
      sessionId: `ses-${((this.rng.next() * 0xffffff) | 0).toString(16).padStart(6, '0')}`,
      taskId: task.id,
      workerId,
      businessId: task.businessId,
      stage,
      capId,
      steps,
      done: 0,
      stepMs: Math.round(this.rng.int(lo, hi) / (steps + 1)),
      waiting: false,
      willFail: false,
    };
    if (stage === 'creation' && this.t > DEMO_EPOCH + 60_000 && (this.failuresLeft[task.businessId] ?? 0) > 0 && this.rng.chance(0.5)) {
      run.willFail = true;
      this.failuresLeft[task.businessId]! -= 1;
    }
    this.busy.add(workerId);
    this.runs.set(run.attemptId, run);
    const ids = { businessId: task.businessId, workerId, taskId: task.id, attemptId: run.attemptId, sessionId: run.sessionId };
    const provider = this.providerRef(capId);
    this.emit('worker.state', ids, { state: 'active', departmentId: departmentForStage(task.businessId, stage), action: 'Starting attempt', provider });
    this.emit('task.assigned', ids, { workerId, stage, provider });
    if (stage === 'audit' || stage === 'fixes') {
      const criteria = task.acceptanceCriteria.map((c, i) => ({ text: c.text, state: i === 0 ? 'in_progress' : 'pending' }));
      this.emit('criteria.updated', ids, { criteria });
    }
    this.after(1500 + this.rng.int(0, 1500), () => this.step(run));
  }

  private ids(run: Run) {
    return { businessId: run.businessId, workerId: run.workerId, taskId: run.taskId, attemptId: run.attemptId, sessionId: run.sessionId };
  }

  private step(run: Run) {
    const task = this.truth.tasks[run.taskId];
    if (!task) return;
    if (!this.usable(run.capId)) {
      const tpl = this.templates.get(run.taskId);
      const alt = (tpl?.eligible ?? []).find((c) => c !== run.capId && this.usable(c));
      if (alt) {
        run.capId = alt;
        this.emit('worker.state', this.ids(run), {
          state: 'active',
          departmentId: departmentForStage(run.businessId, run.stage),
          action: `Rerouted to ${this.caps[alt]!.provider} (fallback route)`,
          provider: this.providerRef(alt),
        });
      } else {
        if (!run.waiting) {
          run.waiting = true;
          this.emit('worker.state', this.ids(run), {
            state: 'waiting_provider',
            departmentId: departmentForStage(run.businessId, run.stage),
            action: `Waiting for ${this.caps[run.capId]!.provider} capacity`,
          });
          this.emit('task.status', this.ids(run), { status: 'waiting_provider', reason: `${this.caps[run.capId]!.provider} unavailable` });
        }
        this.after(3000, () => this.step(run));
        return;
      }
    }
    if (run.waiting) {
      run.waiting = false;
      this.emit('worker.state', this.ids(run), { state: 'active', departmentId: departmentForStage(run.businessId, run.stage), action: 'Resuming' });
      this.emit('task.status', this.ids(run), { status: 'in_progress' });
    }
    const cap = this.caps[run.capId]!;
    cap.requests += 1;
    cap.tokens += this.rng.int(900, 3200);
    if (TRADING_BUSINESSES.has(run.businessId)) this.ledger.addOperatingCost(0.004);

    const actions = ACTIONS[run.stage] ?? [['Working', 'tool']];
    const [action, tool] = actions[run.done % actions.length]!;
    this.emit('attempt.action', this.ids(run), { action, tool });

    if ((run.stage === 'audit' || run.stage === 'fixes') && run.done > 0) {
      const criteria = task.acceptanceCriteria.map((c, i) => ({
        text: c.text,
        state: i < run.done ? 'met' : i === run.done ? 'in_progress' : 'pending',
      }));
      this.emit('criteria.updated', this.ids(run), { criteria });
    }

    run.done++;
    if (run.willFail && run.done === 2) {
      this.after(run.stepMs, () => this.fail(run));
      return;
    }
    if (run.done < run.steps) this.after(run.stepMs, () => this.step(run));
    else this.after(run.stepMs, () => this.finish(run));
  }

  private release(run: Run, delay = 1200) {
    this.runs.delete(run.attemptId);
    this.after(delay, () => {
      this.busy.delete(run.workerId);
      this.emit('worker.state', { businessId: run.businessId, workerId: run.workerId }, { state: 'idle', departmentId: loungeOf(run.businessId) });
    });
  }

  private fail(run: Run) {
    const ids = this.ids(run);
    this.emit('worker.state', ids, {
      state: 'failed',
      departmentId: departmentForStage(run.businessId, run.stage),
      action: 'Build tool exited with code 1 (simulated)',
    });
    this.emit('attempt.finished', ids, { outcome: 'failed' });
    this.emit('task.status', ids, { status: 'failed', reason: 'Attempt failed: build tool error (simulated). Will retry.' });
    this.runs.delete(run.attemptId);
    this.after(14_000, () => {
      this.busy.delete(run.workerId);
      this.emit('worker.state', { businessId: run.businessId, workerId: run.workerId }, { state: 'idle', departmentId: loungeOf(run.businessId) });
      this.emit('task.status', { businessId: run.businessId, taskId: run.taskId }, { status: 'queued' });
    });
  }

  private record(run: Run, findings: string[] = []) {
    const a = artifactPreview(run.stage, this.truth.tasks[run.taskId]?.title ?? run.taskId, findings);
    this.emit('artifact.recorded', this.ids(run), {
      artifact: {
        id: `art-${run.attemptId}`,
        taskId: run.taskId,
        attemptId: run.attemptId,
        kind: a.kind,
        title: a.title,
        preview: a.preview,
        recordedAt: this.t,
        illustrative: true,
      },
    });
  }

  private finish(run: Run) {
    const task = this.truth.tasks[run.taskId];
    if (!task) return;
    if (TRADING_BUSINESSES.has(run.businessId)) return this.finishLedger(run);
    const ids = this.ids(run);
    const biz = run.businessId;
    switch (run.stage) {
      case 'research':
      case 'creation': {
        this.record(run);
        this.emit('attempt.finished', ids, { outcome: 'completed' });
        const to: TaskStage = run.stage === 'research' ? 'creation' : 'audit';
        this.emit('task.handoff', ids, { from: run.stage, to, outcome: 'handoff', durationMs: 6500 });
        break;
      }
      case 'fixes': {
        this.record(run);
        this.emit('audit.findings', ids, { findings: task.findings.map((f) => ({ ...f, resolved: true })) });
        this.emit('attempt.finished', ids, { outcome: 'completed' });
        this.emit('task.handoff', ids, { from: 'fixes', to: 'audit', outcome: 'repaired', durationMs: 6500 });
        break;
      }
      case 'audit': {
        const audits = task.attemptIds.filter((a) => this.truth.attempts[a]?.stage === 'audit').length;
        const fail = audits <= 1 ? this.rng.chance(0.7) : this.rng.chance(0.3);
        if (fail) {
          const picks = new Set<number>();
          const count = this.rng.int(1, 2);
          while (picks.size < count) picks.add(this.rng.int(0, FINDINGS.length - 1));
          const findings = [...picks].map((i) => ({
            id: `f-${task.id}-${audits}-${i}`,
            severity: FINDINGS[i]![1],
            summary: FINDINGS[i]![0],
            resolved: false,
          }));
          this.emit('audit.findings', ids, { findings });
          this.emit('criteria.updated', ids, {
            criteria: task.acceptanceCriteria.map((c, i) => ({ text: c.text, state: i === 0 ? 'unmet' : 'met' })),
          });
          this.record(run, findings.map((f) => f.summary));
          this.emit('attempt.finished', ids, { outcome: 'failed' });
          if (task.repairCount >= task.maxRepairs) {
            this.emit('task.status', ids, { status: 'held', reason: 'Repair budget exhausted - needs a person' });
          } else {
            this.emit('task.handoff', ids, { from: 'audit', to: 'fixes', outcome: 'failed_audit', durationMs: 6500 });
          }
        } else {
          this.emit('criteria.updated', ids, { criteria: task.acceptanceCriteria.map((c) => ({ text: c.text, state: 'met' })) });
          this.record(run);
          this.emit('attempt.finished', ids, { outcome: 'passed' });
          if (this.templates.get(task.id)?.needsApproval) {
            this.emit('worker.state', ids, {
              state: 'waiting_approval',
              departmentId: departmentForStage(biz, 'audit'),
              action: 'Claims need human sign-off',
            });
            this.emit('task.status', ids, { status: 'waiting_approval', reason: 'Claims need human sign-off' });
            this.runs.delete(run.attemptId);
            this.after(25_000, () => {
              this.emit('task.status', { businessId: biz, taskId: task.id }, {
                status: 'held',
                reason: 'Awaiting human sign-off (the demo cannot approve)',
              });
              this.busy.delete(run.workerId);
              this.emit('worker.state', { businessId: biz, workerId: run.workerId }, { state: 'idle', departmentId: loungeOf(biz) });
            });
            return;
          }
          this.emit('task.handoff', ids, { from: 'audit', to: 'ready', outcome: 'ready', durationMs: 6500 });
          this.emit('task.ready', ids, {});
        }
        break;
      }
    }
    this.release(run);
  }

  // ------------------------------------------------------------- redirects

  redirect(req: RedirectRequest) {
    const biz = this.truth.workers[req.workerId]?.businessId ?? 'hermes-hq';
    const base = { businessId: biz, workerId: req.workerId, taskId: req.taskId };
    this.after(1200, () =>
      this.emit('redirect.acknowledged', base, { redirectId: req.id, instruction: req.instruction, simulated: true, note: 'Received by simulated worker' }),
    );
    this.after(3600, () => {
      const task = this.truth.tasks[req.taskId];
      const st = this.truth.statuses[req.workerId];
      const ok = task?.status === 'in_progress' && task.assignedWorkerId === req.workerId && st?.state === 'active';
      if (ok) {
        this.emit('redirect.applied', { ...base, attemptId: st?.attemptId }, {
          redirectId: req.id,
          simulated: true,
          note: 'Instruction added to the current attempt (simulated)',
        });
        this.emit('attempt.action', { ...base, attemptId: st?.attemptId }, { action: 'Applying redirected instruction (simulated)', tool: 'redirect' });
      } else {
        const reason = !task
          ? 'Task not found'
          : task.assignedWorkerId !== req.workerId
            ? 'Worker is no longer on this task'
            : st?.state !== 'active'
              ? `Worker is ${st?.state.replace('_', ' ') ?? 'unknown'}`
              : `Task is ${task.status.replace('_', ' ')}`;
        this.emit('redirect.rejected', base, { redirectId: req.id, simulated: true, reason });
      }
    });
  }

  snapshot(): Snapshot {
    const s = this.truth;
    return {
      takenAt: this.t,
      workers: Object.values(s.workers),
      statuses: Object.values(s.statuses),
      tasks: Object.values(s.tasks),
      attempts: Object.values(s.attempts),
      artifacts: Object.values(s.artifacts),
      capacity: Object.values(s.capacity),
      timeline: s.timeline.slice(-80),
      redirects: Object.values(s.redirects),
      ledger: s.ledger,
    };
  }
}
