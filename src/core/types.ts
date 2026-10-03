/**
 * Domain model for Armis Workshop.
 *
 * Everything here is renderer-agnostic: the scene, the panels and the tests all
 * read the same `WorkshopState`. Stable identity (Worker) is kept apart from
 * ephemeral execution identity (Attempt / session IDs) so a character keeps its
 * name, look and history no matter how many sessions it is used in.
 */

export type BusinessId = string;
export type DepartmentId = string;
export type WorkerId = string;
export type TaskId = string;
export type AttemptId = string;
export type SessionId = string;
export type EventId = string;
export type CapacityId = string;

/** Epoch milliseconds. */
export type Millis = number;

// ---------------------------------------------------------------- businesses

export interface BrandAssets {
  /** Horizontal lockup for dark grounds (e.g. labels, headers). */
  lockupOnDark?: string;
  /** Square-ish mark for dark grounds. */
  markOnDark?: string;
  /** Square-ish mark for light grounds. */
  markOnLight?: string;
}

export interface BrandConfig {
  displayName: string;
  /** Short label for in-scene signage (pixel font, A-Z/0-9 only). */
  signText: string;
  /** True when the name/emblem is a placeholder that must be replaced. */
  provisional: boolean;
  provisionalNote?: string;
  colors: { primary: string; secondary: string; accent: string; glow: string };
  assets: BrandAssets;
  /** Font stack used for this business's panels. */
  fontFamily?: string;
}

export type DepartmentKind =
  | 'research'
  | 'creation'
  | 'audit'
  | 'fixes'
  | 'lounge'
  | 'dispatch'
  | 'capacity'
  | 'feeds'
  | 'rules'
  | 'trader_watch'
  | 'portfolio';

export interface Department {
  id: DepartmentId;
  businessId: BusinessId;
  kind: DepartmentKind;
  label: string;
  /** Number of desks drawn in the room. */
  desks: number;
}

export interface Business {
  id: BusinessId;
  kind: 'hq' | 'business';
  brand: BrandConfig;
  departments: Department[];
}

// ------------------------------------------------------------------- workers

export type HairStyle = 'short' | 'curly' | 'long' | 'bun' | 'mohawk' | 'bald' | 'bob';

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  pants: string;
  accessory?: 'glasses' | 'headphones' | 'beanie' | 'none';
}

/** Persistent character identity. Never carries live status. */
export interface Worker {
  installation?: { defined: boolean; installed: boolean | null; observed: boolean; roleBinding: 'verified' | 'unbound' | 'unknown'; source: string };
  id: WorkerId;
  name: string;
  businessId: BusinessId;
  role: string;
  homeDepartmentId: DepartmentId;
  appearance: Appearance;
}

/**
 * Observed worker states. These are deliberately distinct: a worker waiting on
 * a provider is not "working", and an offline or unknown worker is never drawn
 * as productive.
 */
export type WorkerState =
  | 'active'
  | 'idle'
  | 'waiting_provider'
  | 'waiting_approval'
  | 'failed'
  | 'offline'
  | 'unknown';

export interface ProviderRef {
  provider: string;
  /** Model id if observed. Demo ids are illustrative. */
  model?: string;
  /** Which capacity scope the work draws on (shared, never per-worker). */
  capacityId?: CapacityId;
  /** Whether the model id was verified at runtime or only configured. */
  modelProvenance: Provenance;
}

export interface WorkerStatus {
  workerId: WorkerId;
  state: WorkerState;
  departmentId: DepartmentId;
  taskId?: TaskId;
  attemptId?: AttemptId;
  sessionId?: SessionId;
  provider?: ProviderRef;
  /** Observable action/tool, never private reasoning. */
  action?: string;
  tool?: string;
  stateSince: Millis;
  /** Source timestamp of the newest event observed about this worker. */
  lastObservedAt: Millis;
}

// --------------------------------------------------------------------- tasks

export type TaskStage =
  | 'research'
  | 'creation'
  | 'audit'
  | 'fixes'
  | 'ready'
  | 'feeds'
  | 'rules'
  | 'trader_watch'
  | 'portfolio'
  | 'rejected';

export type TaskStatus =
  | 'queued'
  | 'in_progress'
  | 'waiting_provider'
  | 'waiting_approval'
  | 'held'
  | 'failed'
  | 'ready'
  /** Explicitly rejected (e.g. a trading candidate that did not pass). Terminal. */
  | 'rejected';

export type FindingSeverity = 'critical' | 'serious' | 'moderate' | 'minor';

export interface AuditFinding {
  id: string;
  severity: FindingSeverity;
  summary: string;
  resolved: boolean;
}

export interface Artifact {
  id: string;
  taskId: TaskId;
  attemptId?: AttemptId;
  kind: 'markdown' | 'report' | 'diff' | 'log';
  title: string;
  /** Sanitized preview text. */
  preview: string;
  recordedAt: Millis;
  /** Always shown: a demo artifact is illustrative content. */
  illustrative: boolean;
}

export interface CriterionState {
  text: string;
  state: 'pending' | 'in_progress' | 'met' | 'unmet';
}

export interface Task {
  parentTaskId?: string;
  id: TaskId;
  businessId: BusinessId;
  title: string;
  acceptanceCriteria: CriterionState[];
  stage: TaskStage;
  status: TaskStatus;
  assignedWorkerId?: WorkerId;
  attemptIds: AttemptId[];
  findings: AuditFinding[];
  artifactIds: string[];
  repairCount: number;
  maxRepairs: number;
  /** Which capacity scopes may serve this task (explicit, not guessed). */
  eligibleCapacity: CapacityId[];
  heldReason?: string;
  createdAt: Millis;
  updatedAt: Millis;
}

export type AttemptOutcome = 'passed' | 'failed' | 'aborted' | 'superseded' | 'completed';

export interface Attempt {
  id: AttemptId;
  taskId: TaskId;
  workerId: WorkerId;
  sessionId: SessionId;
  stage: TaskStage;
  startedAt: Millis;
  endedAt?: Millis;
  /** Undefined means "not observed" - never assumed successful. */
  outcome?: AttemptOutcome;
  provider?: ProviderRef;
}

// ------------------------------------------------------------------ capacity

export type Provenance = 'provider_reported' | 'locally_measured' | 'estimated' | 'unknown';

export interface Measured<T> {
  value: T | null;
  provenance: Provenance;
  /** Source note, e.g. "x-ratelimit-remaining header". */
  note?: string;
}

export type Availability = 'available' | 'limited' | 'unavailable' | 'unknown';

export interface CapacityWindow {
  id: string;
  label: string;
  scope: string;
  unit: 'requests' | 'input_tokens' | 'percent' | 'tokens';
  remaining: Measured<number>;
  limit: Measured<number>;
  resetAt: Measured<number>;
  observedAt: number | null;
  source: string;
  maxAgeMs: number;
}

export interface ProviderCapacity {
  windows?: CapacityWindow[];
  configured?: boolean;
  source?: string;
  maxAgeMs?: number;
  id: CapacityId;
  provider: string;
  scope: { kind: 'account' | 'project' | 'organization'; label: string };
  models: string[];
  modelsIllustrative: boolean;
  availability: Measured<Availability>;
  remaining: Measured<number> & { unit?: 'requests' | 'tokens' };
  resetAt: Measured<Millis>;
  local: {
    requests: Measured<number>;
    tokens: Measured<number>;
    windowLabel: string;
  };
  fallbackCapacityId?: CapacityId;
  fallbackNote?: string;
  lastCheckedAt: Millis | null;
}

// ------------------------------------------------------------------ redirect

export type RedirectState = 'requested' | 'acknowledged' | 'applied' | 'rejected';

export interface RedirectRequest {
  id: string;
  workerId: WorkerId;
  taskId: TaskId;
  attemptId?: AttemptId;
  instruction: string;
  state: RedirectState;
  simulated: boolean;
  history: { state: RedirectState; at: Millis; note?: string }[];
  reason?: string;
}

// -------------------------------------------------------------------- events

export type ActivityEventType =
  | 'task.created'
  | 'task.assigned'
  | 'task.handoff'
  | 'task.status'
  | 'task.ready'
  | 'attempt.started'
  | 'attempt.action'
  | 'attempt.finished'
  | 'audit.findings'
  | 'criteria.updated'
  | 'artifact.recorded'
  | 'worker.state'
  | 'worker.heartbeat'
  | 'capacity.updated'
  | 'redirect.acknowledged'
  | 'redirect.applied'
  | 'redirect.rejected'
  | 'ledger.updated';

export interface ActivityEvent<P = Record<string, unknown>> {
  id: EventId;
  type: ActivityEventType;
  /** When the source says it happened. */
  sourceTs: Millis;
  /** When this viewer received it. */
  receivedTs: Millis;
  businessId: BusinessId;
  workerId?: WorkerId;
  taskId?: TaskId;
  attemptId?: AttemptId;
  sessionId?: SessionId;
  /** Sanitized, observable payload. Never contains private reasoning. */
  payload: P;
}

/** A handoff rendered as a travelling dot. Derived from `task.handoff` events. */
export interface TrafficDot {
  id: string; // = source event id
  taskId: TaskId;
  businessId: BusinessId;
  from: TaskStage | 'hq';
  to: TaskStage | 'hq';
  outcome: 'handoff' | 'failed_audit' | 'repaired' | 'ready' | 'dispatched' | 'rejected';
  startedAt: Millis;
  durationMs: number;
  label: string;
}

export interface TimelineEntry {
  eventId: EventId;
  at: Millis;
  type: ActivityEventType;
  businessId: BusinessId;
  workerId?: WorkerId;
  taskId?: TaskId;
  text: string;
}

// --------------------------------------------------------------- connection

export type ConnectionState = 'demo' | 'connected' | 'reconnecting' | 'disconnected';

export interface Snapshot {
  takenAt: Millis;
  workers: Worker[];
  statuses: WorkerStatus[];
  tasks: Task[];
  attempts: Attempt[];
  artifacts: Artifact[];
  capacity: ProviderCapacity[];
  /** Optional recent history so a fresh viewer has context. */
  timeline?: TimelineEntry[];
  redirects?: RedirectRequest[];
  ledger?: Record<BusinessId, LedgerBook>;
}

export interface WorkshopState {
  connection: ConnectionState;
  /** "Now" on the source clock (simulated in demo mode). */
  now: Millis;
  /** Source time of the newest snapshot or event applied. */
  lastEventAt: Millis | null;
  workers: Record<WorkerId, Worker>;
  statuses: Record<WorkerId, WorkerStatus>;
  tasks: Record<TaskId, Task>;
  attempts: Record<AttemptId, Attempt>;
  artifacts: Record<string, Artifact>;
  capacity: Record<CapacityId, ProviderCapacity>;
  redirects: Record<string, RedirectRequest>;
  traffic: TrafficDot[];
  timeline: TimelineEntry[];
  /** Per-task timeline, bounded. */
  taskTimeline: Record<TaskId, TimelineEntry[]>;
  /** Bounded set of seen event ids, for de-duplication. */
  seenIds: string[];
  seenSet: Set<string>;
  /** Newest applied sourceTs per entity key, for out-of-order handling. */
  entityClock: Record<string, Millis>;
  /** Paper-trading book per trading business (Aster Ledger). Simulated only. */
  ledger: Record<BusinessId, LedgerBook>;
  stats: { applied: number; duplicates: number; outOfOrder: number };
}

// ------------------------------------------------------- paper trading

/** A market venue. Configurable; demo values are illustrative. */
export interface Venue {
  id: string;
  name: string;
  /** Distinguishes e.g. international Polymarket from Polymarket US. */
  jurisdiction: string;
  note: string;
  configured: boolean;
}

export interface VenueQuote {
  venueId: string;
  /** The venue's own contract wording. Similar names are NOT assumed identical. */
  contractLabel: string;
  ruleCompat: 'compatible' | 'differs' | 'unverified';
  ruleNote: string;
  bid: number | null;
  ask: number | null;
  feePct: number | null;
  depth: number | null;
  quoteAt: Millis | null;
  /** Net cost per contract after fees for the side considered. */
  netAsk: number | null;
}

export type CandidateDecision = 'pending' | 'paper_entry' | 'no_trade' | 'rejected';

export interface Candidate {
  taskId: TaskId;
  question: string;
  side: 'YES' | 'NO';
  quotes: VenueQuote[];
  /** "Best observed net price" among compatible, fresh quotes - never "best odds". */
  bestVenueId: string | null;
  decision: CandidateDecision;
  reason?: string;
  newsIds: string[];
  estimate?: number;
}

export interface NewsItem {
  id: string;
  headline: string;
  source: string;
  primary: boolean;
  publishedAt: Millis;
  observedAt: Millis;
  contradicts: string[];
  candidateId?: TaskId;
}

export interface TraderSummary {
  id: string;
  handle: string;
  summary: string;
  observedAt: Millis;
  source: string;
}

export interface Position {
  id: string;
  candidateId: TaskId;
  contract: string;
  venueId: string;
  side: 'YES' | 'NO';
  qty: number;
  avgPrice: number;
  mark: number;
  recommendation: 'hold' | 'reduce' | 'close';
  rationale: string;
  netExitValue: number;
  liquidityWarning?: string;
  pairedWith?: string;
  hedgeWarning?: string;
  exit?: { requestedQty: number; filledQty: number; status: 'partial' | 'filled'; note: string };
}

export interface SourceFreshness {
  id: string;
  label: string;
  lastAt: Millis | null;
  state: 'fresh' | 'stale' | 'conflicting' | 'unknown';
}

export interface LedgerBook {
  paper: true;
  startingBankroll: number;
  available: number;
  reserved: number;
  realized: number;
  unrealized: number;
  drawdownPct: number;
  /** Running peak, kept separately so drawdown survives history trimming. */
  peakEquity: number;
  equityHistory: { at: Millis; equity: number }[];
  /** Operating costs (AI usage etc.) are kept apart from trading P&L. */
  operatingCosts: { label: string; amount: number; provenance: Provenance }[];
  venues: Venue[];
  candidates: Record<TaskId, Candidate>;
  news: NewsItem[];
  traders: TraderSummary[];
  positions: Position[];
  sources: SourceFreshness[];
  history: { at: Millis; text: string }[];
  updatedAt: Millis;
}
