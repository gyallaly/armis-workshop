/** Deliberately copied wire enums from control src/viewer.ts; no execution imports. */
export const EVENT_TYPES = [
  'mandate.issued','mandate.acknowledged','mandate.held','mandate.revoked',
  'task.queued','task.claimed','task.started','task.waiting','task.completed','task.failed','task.held','task.reconciled',
  'attempt.started','attempt.activity','attempt.finished','attempt.expired',
  'review.requested','review.failed','review.passed','correction.requested','review.rerequested',
  'artifact.handed-off','report.received','capacity.available','capacity.limited','capacity.exhausted','capacity.recovered','capacity.unknown',
  'heartbeat.lost','heartbeat.recovered','worker.idle','worker.offline',
  'source.connected','source.stale','source.disconnected',
  'redirect.requested','redirect.acknowledged','redirect.applied','redirect.rejected','redirect.failed','model.changed','control.changed',
] as const;
export interface RuntimeEvent {
  version: 1; eventId: string; cursor: number; source: string; type: typeof EVENT_TYPES[number];
  occurredAt: number; mode: 'live'; businessId: string | null; workerId: string | null;
  taskId: string | null; attemptId: string | null; sessionId: string | null; mandateId: string | null;
  data: Record<string, unknown>;
}
const WORKERS = new Set([
  'armis.ceo','armis.cfo','armis.efficiency','armis.audit','armis.operations',
  'armis.finance-analyst','armis.evaluator','armis.prompt-engineer','armis.auditor','armis.operator',
  ...['uditus','aster','etsy'].flatMap(b => ['ceo','delivery','research','quality','creator','fixer','researcher','reviewer'].map(r => `${b}.${r}`)),
]);
function invalid(): never { throw Error('Invalid journal observation'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}
// Heuristic credential rejection complements, but cannot replace, trusted source binding.
const SECRET = /(?:\bsk[-_]|gh[pousr]_|github_pat_|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]+\.|bearer|password|credential|secret|api[-_:]?key|access[-_:]?token|refresh[-_:]?token)/i;
function id(value: unknown, max = 120): string {
  if (typeof value !== 'string' || value.length > max || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value) || SECRET.test(value)) return invalid();
  return value;
}
function nullableId(value: unknown) { return value === null ? null : id(value); }
function enumeration(value: unknown, allowed: readonly string[], nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !allowed.includes(value)) return invalid();
  return value;
}
function boolean(value: unknown) { if (typeof value !== 'boolean') return invalid(); return value; }
/** Output is a positive allowlist, never a source-row/object spread. */
export function project(row: { cursor: unknown; event_id: unknown; body: unknown }): RuntimeEvent {
  if (typeof row.body !== 'string' || row.body.length > 32768) return invalid();
  const body = object(JSON.parse(row.body));
  if (body.version !== 1 || body.mode !== 'live' || body.provenance !== 'observed') return invalid();
  const eventId = id(body.eventId, 256);
  if (eventId !== row.event_id) return invalid();
  if (body.sourceSequence !== null) integer(body.sourceSequence);
  integer(body.receivedAt);
  const cursor = integer(row.cursor);
  if (!cursor || (body.cursor !== undefined && body.cursor !== cursor)) return invalid();
  const type = enumeration(body.type, EVENT_TYPES) as RuntimeEvent['type'];
  const data: Record<string, unknown> = {}, raw = object(body.data);
  for (const key of ['parentMandateId','capacityPoolId','requestedModel','actualModel','provider','artifactId','reviewerId','senderId','recipientId'])
    if (raw[key] !== undefined) data[key] = nullableId(raw[key]);
  if (body.source === 'armis-setup-runtime') {
    for (const key of ['parentTaskId','profileName']) if (raw[key] !== undefined) data[key] = nullableId(raw[key]);
    for (const key of ['installed','accepted']) if (raw[key] !== undefined) data[key] = boolean(raw[key]);
    if (raw.outcome !== undefined) data.outcome = enumeration(raw.outcome,['completed','held']);
  }
  for (const key of ['costMicros','quotaUnits','inputTokens','outputTokens','cacheTokens','remaining','total','resetAt','observedAt','maxAgeMs','round','evidenceCount'])
    if (raw[key] !== undefined) data[key] = raw[key] === null ? null : integer(raw[key]);
  for (const key of ['localRequests','localTokens'])if(raw[key]!==undefined)data[key]=raw[key]===null?null:integer(raw[key]);
  for (const key of ['scopeLabel','quotaWindowLabel'])if(raw[key]!==undefined)data[key]=nullableId(raw[key]);
  if(raw.scopeKind!==undefined)data.scopeKind=enumeration(raw.scopeKind,['account','project','organization','unknown']);
  for (const key of ['costProvenance','quotaProvenance'])
    if (raw[key] !== undefined) data[key] = enumeration(raw[key], ['observed','unknown']);
  if (raw.waitReason !== undefined) data.waitReason = enumeration(raw.waitReason, ['provider','local-resource','dependency','owner','tool','capacity','unknown']);
  if (raw.unit !== undefined) data.unit = enumeration(raw.unit, ['tokens','requests','slots'], true);
  if (raw.state !== undefined) data.state = enumeration(raw.state,
    type.startsWith('redirect.') ? ['requested','acknowledged','rejected','failed','applied'] : ['ready','held'], true);
  if (raw.action !== undefined) data.action = enumeration(raw.action, ['retry','cancel']);
  for (const key of ['evidencePresent','stopped']) if (raw[key] !== undefined) data[key] = boolean(raw[key]);
  if (raw.evidence !== undefined) {
    const evidence = object(raw.evidence);
    if (evidence.contentExposed !== false) return invalid();
    data.evidence = { present: boolean(evidence.present), contentExposed: false };
  }
  const workerId = nullableId(body.workerId);
  if (workerId !== null && !WORKERS.has(workerId)) return invalid();
  return { version: 1, eventId, cursor, source: id(body.source), type, occurredAt: integer(body.occurredAt), mode: 'live',
    businessId: enumeration(body.businessId, ['armis','uditus','aster','etsy'], true), workerId,
    taskId: nullableId(body.taskId), attemptId: nullableId(body.attemptId), sessionId: nullableId(body.sessionId),
    mandateId: nullableId(body.mandateId), data };
}
