import type { ActivityEvent, ActivityEventType, Snapshot } from './types';

/** Hard rejection limits, not truncation: an incomplete observation is misleading. */
export const VALIDATION_LIMITS = { id: 128, text: 512, preview: 8192, items: 64 } as const;

type Parser = (value: unknown) => unknown;
type Shape = Record<string, Parser>;
const INVALID = new Error('Invalid viewer record');
const fail = (): never => { throw INVALID; };
const SECRET = /(?:\b(?:authorization\s*[:=]|cookie\s*[:=]|bearer\s+\S+)|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|token|password|passwd|secret|credentials?)\s*["']?\s*[:=]\s*\S+|\b(?:sk-(?:proj-|ant-)?[a-z0-9_-]{6,}|gh[pousr]_[a-z0-9]{8,}|github_pat_[a-z0-9_]{8,}|AKIA[A-Z0-9]{16})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b|https?:\/\/[^\s/]+:[^\s/]+@)/i;

function text(max: number = VALIDATION_LIMITS.text, empty = false): Parser {
  return (v) => typeof v === 'string' && v.length <= max && (empty || v.trim().length > 0) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v) && !SECRET.test(v) ? v : fail();
}
const id: Parser = (v) => {
  const s = text(VALIDATION_LIMITS.id)(v) as string;
  return /^[a-zA-Z0-9][a-zA-Z0-9_@.:/-]*$/.test(s) && !['__proto__', 'constructor', 'prototype'].includes(s) ? s : fail();
};
const number: Parser = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER ? v : fail();
const nonnegative: Parser = (v) => (number(v) as number) >= 0 ? v : fail();
const integer: Parser = (v) => Number.isSafeInteger(nonnegative(v)) ? v : fail();
const boolean: Parser = (v) => typeof v === 'boolean' ? v : fail();
const enumOf = (...values: (string | boolean)[]): Parser => (v) => values.includes(v as string) ? v : fail();
const optional = (parse: Parser): Parser => (v) => v === undefined ? undefined : parse(v);
const nullable = (parse: Parser): Parser => (v) => v === null ? null : parse(v);
const list = (parse: Parser, max: number = VALIDATION_LIMITS.items): Parser => (v) => {
  if (!Array.isArray(v) || v.length > max) return fail();
  // Array.map skips holes. Read every index so sparse arrays cannot pass validation.
  return Array.from(v, (item) => parse(item));
};
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail();
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return fail();
  return v as Record<string, unknown>;
}
function own(v: Record<string, unknown>, key: string): unknown {
  const property = Object.getOwnPropertyDescriptor(v, key);
  if (property && !('value' in property)) return fail();
  return property?.value;
}
const object = (shape: Shape): Parser => (v) => {
  const input = record(v);
  const result: Record<string, unknown> = {};
  for (const [key, parse] of Object.entries(shape)) {
    const value = parse(own(input, key));
    if (value !== undefined) result[key] = value;
  }
  return result;
};

const dictionary = (parse: Parser, max: number): Parser => (v) => {
  const input = record(v);
  const keys = Object.keys(input);
  if (keys.length > max) return fail();
  const result: Record<string, unknown> = {};
  for (const key of keys) { id(key); result[key] = parse(own(input, key)); }
  return result;
};

const stage = enumOf('research', 'creation', 'audit', 'fixes', 'ready', 'feeds', 'rules', 'trader_watch', 'portfolio', 'rejected');
const route = enumOf('hq', 'research', 'creation', 'audit', 'fixes', 'ready', 'feeds', 'rules', 'trader_watch', 'portfolio', 'rejected');
const workerState = enumOf('active', 'idle', 'waiting_provider', 'waiting_approval', 'failed', 'offline', 'unknown');
const taskStatus = enumOf('queued', 'in_progress', 'waiting_provider', 'waiting_approval', 'held', 'failed', 'ready', 'rejected');
const provenance = enumOf('provider_reported', 'locally_measured', 'estimated', 'unknown');
const outcome = enumOf('passed', 'failed', 'aborted', 'superseded', 'completed');
const provider = object({ provider: text(128), model: optional(text(128)), capacityId: optional(id), modelProvenance: provenance });
const finding = object({ id, severity: enumOf('critical', 'serious', 'moderate', 'minor'), summary: text(), resolved: boolean });
const criterion = object({ text: text(), state: enumOf('pending', 'in_progress', 'met', 'unmet') });
const artifact = object({ id, taskId: id, attemptId: optional(id), kind: enumOf('markdown', 'report', 'diff', 'log'), title: text(), preview: text(VALIDATION_LIMITS.preview, true), recordedAt: integer, illustrative: boolean });
const measured = (value: Parser, extra: Shape = {}): Parser => object({ value: nullable(value), provenance, note: optional(text()), ...extra });
const capacity = object({
  id, provider: text(128), scope: object({ kind: enumOf('account', 'project', 'organization'), label: text() }),
  models: list(text(128)), modelsIllustrative: boolean,
  availability: measured(enumOf('available', 'limited', 'unavailable', 'unknown')),
  remaining: measured(nonnegative, { unit: optional(enumOf('requests', 'tokens')) }), resetAt: measured(integer),
  local: object({ requests: measured(integer), tokens: measured(integer), windowLabel: text(512, true) }),
  fallbackCapacityId: optional(id), fallbackNote: optional(text()), lastCheckedAt: nullable(integer),
  configured: optional(boolean), source: optional(text()), maxAgeMs: optional(integer),
  windows: optional(list(object({ id, label: text(), scope: text(), unit: enumOf('requests', 'input_tokens', 'percent', 'tokens'), remaining: measured(nonnegative), limit: measured(nonnegative), resetAt: measured(integer), observedAt: nullable(integer), source: text(), maxAgeMs: integer }))),
});

const side = enumOf('YES', 'NO');
const quote = object({ venueId: id, contractLabel: text(), ruleCompat: enumOf('compatible', 'differs', 'unverified'), ruleNote: text(), bid: nullable(nonnegative), ask: nullable(nonnegative), feePct: nullable(nonnegative), depth: nullable(nonnegative), quoteAt: nullable(integer), netAsk: nullable(nonnegative) });
const candidate = object({ taskId: id, question: text(), side, quotes: list(quote), bestVenueId: nullable(id), decision: enumOf('pending', 'paper_entry', 'no_trade', 'rejected'), reason: optional(text()), newsIds: list(id), estimate: optional(nonnegative) });
const ledger = object({
  paper: enumOf(true), startingBankroll: nonnegative, available: number, reserved: nonnegative, realized: number, unrealized: number, drawdownPct: nonnegative, peakEquity: nonnegative,
  equityHistory: list(object({ at: integer, equity: number }), 256),
  operatingCosts: list(object({ label: text(), amount: nonnegative, provenance })),
  venues: list(object({ id, name: text(), jurisdiction: text(), note: text(), configured: boolean })),
  candidates: dictionary(candidate, 256),
  news: list(object({ id, headline: text(), source: text(), primary: boolean, publishedAt: integer, observedAt: integer, contradicts: list(id), candidateId: optional(id) }), 256),
  traders: list(object({ id, handle: text(), summary: text(), observedAt: integer, source: text() }), 256),
  positions: list(object({ id, candidateId: id, contract: text(), venueId: id, side, qty: nonnegative, avgPrice: nonnegative, mark: nonnegative, recommendation: enumOf('hold', 'reduce', 'close'), rationale: text(), netExitValue: number, liquidityWarning: optional(text()), pairedWith: optional(id), hedgeWarning: optional(text()), exit: optional(object({ requestedQty: nonnegative, filledQty: nonnegative, status: enumOf('partial', 'filled'), note: text() })) }), 256),
  sources: list(object({ id, label: text(), lastAt: nullable(integer), state: enumOf('fresh', 'stale', 'conflicting', 'unknown') })),
  history: list(object({ at: integer, text: text() }), 256), updatedAt: integer,
});
const redirectState = enumOf('requested', 'acknowledged', 'applied', 'rejected');
const redirect = object({ id, workerId: id, taskId: id, attemptId: optional(id), instruction: text(), state: redirectState, simulated: enumOf(true), history: list(object({ state: redirectState, at: integer, note: optional(text()) }), 16), reason: optional(text()) });

const payloads: Record<ActivityEventType, Parser> = {
  'task.created': object({ parentTaskId: optional(id), title: text(), criteria: optional(list(text())), stage: optional(stage), maxRepairs: optional(integer), eligibleCapacity: optional(list(id)), mandateId: optional(id), source: optional(text()) }),
  'task.assigned': object({ stage: optional(stage), provider: optional(provider), workerId: optional(id) }),
  'task.handoff': object({ from: route, to: route, outcome: optional(enumOf('handoff', 'failed_audit', 'repaired', 'ready', 'dispatched', 'rejected')), durationMs: optional(integer) }),
  'task.status': object({ status: taskStatus, reason: optional(text()) }),
  'task.ready': object({}),
  'attempt.started': object({ stage: optional(stage), provider: optional(provider) }),
  'attempt.action': object({ action: text(), tool: optional(text()) }),
  'attempt.finished': object({ outcome: optional(outcome) }),
  'audit.findings': object({ findings: list(finding) }),
  'criteria.updated': object({ criteria: list(criterion) }),
  'artifact.recorded': object({ artifact }),
  'worker.state': object({ state: workerState, departmentId: optional(id), provider: optional(provider), action: optional(text()), tool: optional(text()) }),
  'worker.heartbeat': object({}),
  'capacity.updated': object({ capacity }),
  'redirect.acknowledged': object({ redirectId: id, instruction: optional(text()), reason: optional(text()) }),
  'redirect.applied': object({ redirectId: id, instruction: optional(text()), reason: optional(text()) }),
  'redirect.rejected': object({ redirectId: id, instruction: optional(text()), reason: optional(text()) }),
  // Demo-only contract; the Live transport must reject this type before delivery.
  'ledger.updated': object({ book: ledger }),
};

const worker = object({
  id, name: text(128), businessId: id, role: text(), homeDepartmentId: id,
  installation: optional(object({defined: boolean, installed: nullable(boolean), observed: boolean, roleBinding: enumOf('verified', 'unbound', 'unknown'), source: text()})),
  appearance: object({ skin: text(32), hair: text(32), hairStyle: enumOf('short', 'curly', 'long', 'bun', 'mohawk', 'bald', 'bob'), shirt: text(32), pants: text(32), accessory: optional(enumOf('glasses', 'headphones', 'beanie', 'none')) }),
});
const status = object({ workerId: id, state: workerState, departmentId: id, taskId: optional(id), attemptId: optional(id), sessionId: optional(id), provider: optional(provider), action: optional(text()), tool: optional(text()), stateSince: integer, lastObservedAt: integer });
const task = object({
  id, businessId: id, title: text(), acceptanceCriteria: list(criterion), stage, status: taskStatus,
  assignedWorkerId: optional(id), attemptIds: list(id, 1024), findings: list(finding), artifactIds: list(id),
  repairCount: integer, maxRepairs: integer, eligibleCapacity: list(id), heldReason: optional(text()), createdAt: integer, updatedAt: integer,
  mandateId: optional(id), source: optional(text()),
});
const attempt = object({ id, taskId: id, workerId: id, sessionId: id, stage, startedAt: integer, endedAt: optional(integer), outcome: optional(outcome), provider: optional(provider) });
const timeline = object({ eventId: id, at: integer, type: enumOf(...Object.keys(payloads)), businessId: id, workerId: optional(id), taskId: optional(id), text: text() });
const snapshot = object({
  takenAt: integer, workers: list(worker, 256), statuses: list(status, 256), tasks: list(task, 120),
  attempts: list(attempt, 1024), artifacts: list(artifact, 1024), capacity: list(capacity), timeline: optional(list(timeline, 300)),
  redirects: optional(list(redirect, 50)), ledger: optional(dictionary(ledger, 64)),
});

/** Atomic snapshot validation: one malformed entity rejects the whole snapshot. */
export function normalizeSnapshot(raw: unknown): Snapshot | null {
  try { return snapshot(raw) as Snapshot; } catch { return null; }
}

const envelope = object({ id, type: enumOf(...Object.keys(payloads)), sourceTs: integer, receivedTs: integer, businessId: id, workerId: optional(id), taskId: optional(id), attemptId: optional(id), sessionId: optional(id) });

/** Validate unknown input and copy only observable allowlisted fields. No defaults. */
export function normalizeEvent(raw: unknown): ActivityEvent | null {
  try {
    const input = record(raw);
    const event = envelope(input) as ActivityEvent;
    const type = event.type;
    if ((type.startsWith('task.') || ['audit.findings', 'criteria.updated', 'artifact.recorded'].includes(type)) && !event.taskId) return null;
    if ((type.startsWith('worker.') || type === 'task.assigned' || type === 'attempt.action' || type.startsWith('redirect.')) && !event.workerId) return null;
    if ((type === 'attempt.started' || type === 'attempt.finished') && !event.attemptId) return null;
    event.payload = payloads[type](own(input, 'payload')) as Record<string, unknown>;
    if (type === 'artifact.recorded' && (event.payload.artifact as Record<string, unknown>).taskId !== event.taskId) return null;
    return event;
  } catch { return null; }
}
