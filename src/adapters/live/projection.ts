import type { ActivityEvent, Snapshot, Worker, TaskStage } from '../../core/types';
import { initialState, reduce } from '../../core/reducer';
import { ROSTER } from '../../core/config';

export const BUSINESS_MAP: Record<string, string> = { armis: 'hermes-hq', uditus: 'uditus', aster: 'aster-ledger', etsy: 'etsy-studio' };
const DIRECTORS: Record<string, string> = { 'armis.ceo': 'Managing Director — Hermes', 'armis.cfo': 'Finance Director', 'armis.efficiency': 'Efficiency Director', 'armis.audit': 'Audit Director', 'armis.operations': 'Operations Director' };
const SHARED = ['finance-analyst', 'evaluator', 'prompt-engineer', 'auditor', 'operator'];
const SUBSIDIARY = ['ceo', 'delivery', 'research', 'quality', 'creator', 'fixer', 'researcher', 'reviewer'];
const TYPES = new Set(['mandate.issued','mandate.acknowledged','mandate.held','mandate.revoked','task.queued','task.claimed','task.started','task.waiting','task.completed','task.failed','task.held','task.reconciled','attempt.started','attempt.activity','attempt.finished','attempt.expired','review.requested','review.failed','review.passed','correction.requested','review.rerequested','artifact.handed-off','report.received','capacity.available','capacity.limited','capacity.exhausted','capacity.recovered','capacity.unknown','heartbeat.lost','heartbeat.recovered','worker.idle','worker.offline','source.connected','source.stale','source.disconnected','redirect.requested','redirect.acknowledged','redirect.applied','redirect.rejected','redirect.failed','model.changed','control.changed']);
export interface Observation {
  version: 1; mode: 'live'; eventId: string; cursor: number; source: string; type: string; occurredAt: number;
  businessId: string | null; workerId: string | null; taskId: string | null; attemptId: string | null; sessionId: string | null; mandateId: string | null;
  data: Record<string, unknown>;
}
const secret = /(?:\bsk-|AIza|gh[pousr]_|Bearer\s|token[=:]|password[=:]|cookie[=:]|-----BEGIN|eyJ[A-Za-z0-9_-]+\.)/i;
function id(v: unknown): v is string { return typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(v) && !secret.test(v) && !['__proto__','constructor','prototype'].includes(v); }
function n(v: unknown): v is number { return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0; }
function roleBusiness(role: string): string | undefined {
  if (role === 'hermes.default') return 'armis';
  const [business, name] = role.split('.');
  if (business === 'armis' && (DIRECTORS[role] || SHARED.includes(name!))) return business;
  if (['uditus','aster','etsy'].includes(business!) && SUBSIDIARY.includes(name!)) return business;
  return undefined;
}
export function validateObservation(value: unknown): Observation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid observation');
  const e = value as Record<string, unknown>;
  if (e.version !== 1 || e.mode !== 'live' || !id(e.eventId) || !id(e.source) || !n(e.cursor) || !n(e.occurredAt) || !TYPES.has(String(e.type))) throw Error('Unsupported observation contract');
  const nullable = (key: string) => { const v = e[key]; if (v !== undefined && v !== null && !id(v)) throw Error('Invalid identifier'); return typeof v === 'string' ? v : null; };
  const businessId = nullable('businessId'), workerId = nullable('workerId');
  if (businessId !== null && !Object.hasOwn(BUSINESS_MAP, businessId)) throw Error('Unknown business');
  if (workerId === 'hermes.default' && e.source !== 'hermes-metadata') throw Error('Invalid native role source');
  if (workerId && (!roleBusiness(workerId) || (businessId && roleBusiness(workerId) !== businessId))) throw Error('Role/business mismatch');
  if (!e.data || typeof e.data !== 'object' || Array.isArray(e.data)) throw Error('Invalid data');
  const raw = e.data as Record<string, unknown>, data: Record<string, unknown> = {};
  for (const k of ['actualModel','requestedModel','provider','capacityPoolId','parentMandateId','parentTaskId','profileName','artifactId','reviewerId']) {
    if (raw[k] !== undefined && raw[k] !== null && !id(raw[k])) throw Error('Unsafe metadata');
    if (raw[k] !== undefined) data[k] = raw[k];
  }
  for (const k of ['inputTokens','outputTokens','remaining','total','resetAt','observedAt','maxAgeMs','round','evidenceCount']) {
    if (raw[k] !== undefined && raw[k] !== null && !n(raw[k])) throw Error('Invalid metric');
    if (raw[k] !== undefined) data[k] = raw[k];
  }
  if (e.source === 'hermes-metadata' && typeof raw.tool === 'string') {
    if (!/^[A-Za-z0-9_.]{1,96}$/.test(raw.tool) || secret.test(raw.tool)) throw Error('Invalid tool name');
    data.tool = raw.tool;
    if (raw.phase === 'requested' || raw.phase === 'returned') data.phase = raw.phase;
  }
  if (e.source === 'armis-setup-runtime') {
    if (typeof raw.installed === 'boolean') data.installed = raw.installed;
    if (typeof raw.accepted === 'boolean') data.accepted = raw.accepted;
    if (['completed','held'].includes(String(raw.outcome))) data.outcome = raw.outcome;
  }
  if (raw.state === 'ready' || raw.state === 'held') data.state = raw.state;
  if (['provider','local-resource','dependency','owner','tool','capacity','unknown'].includes(String(raw.waitReason))) data.waitReason = raw.waitReason;
  return { version: 1, mode: 'live', eventId: e.eventId, cursor: e.cursor, source: e.source, type: String(e.type), occurredAt: e.occurredAt, businessId, workerId, taskId: nullable('taskId'), attemptId: nullable('attemptId'), sessionId: nullable('sessionId'), mandateId: nullable('mandateId'), data };
}
export function observedWorker(role: string): Worker {
  const business = roleBusiness(role);
  if (!business) throw Error('Unknown role');
  const businessId = BUSINESS_MAP[business]!;
  const name = role === 'hermes.default' ? 'Hermes — default profile' : DIRECTORS[role] ?? (role.endsWith('.ceo') ? `CEO of ${business === 'uditus' ? 'Uditus' : business === 'aster' ? 'Aster Ledger' : 'Etsy Business'}` : role.split('.').at(-1)!);
  // Fixed appearance from stable technical identity, not Demo preferences.
  const shirt = ['#6b7a8f','#2f3b52','#9c4a3c','#4c3a73'][Array.from(role).reduce((a,c) => a + c.charCodeAt(0), 0) % 4]!;
  const declared = ROSTER.find(w => w.id === role);
  const dept = business === 'armis' ? (role === 'armis.auditor' ? 'quality' : role === 'armis.finance-analyst' ? 'finance' : ['armis.evaluator','armis.prompt-engineer'].includes(role) ? 'efficiency' : 'operations') : role.endsWith('reviewer') || role.endsWith('quality') ? 'quality' : role.endsWith('researcher') || role.endsWith('research') ? 'research' : 'delivery';
  return { id: role, name, role: name, businessId, installation: {defined: true, installed: null, observed: true, roleBinding: role === 'hermes.default' ? 'unbound' : 'unknown', source: role === 'hermes.default' ? 'Explicitly bound default-profile session metadata' : 'Armis observed role registry'}, homeDepartmentId: declared?.homeDepartmentId ?? `${businessId}:${dept}`, reportsTo: declared?.reportsTo ?? (role === 'armis.auditor' ? 'armis.audit' : role === 'armis.operator' ? 'armis.operations' : undefined), mandate: declared?.mandate, appearance: { skin: '#c68c5f', hair: '#171313', hairStyle: 'short', shirt, pants: '#1d2230', accessory: 'none' } };
}
function stageFor(e: Observation): TaskStage {
  if (e.type.startsWith('review.')) return 'audit';
  if (e.type === 'correction.requested') return 'fixes';
  if (e.workerId?.endsWith('reviewer') || e.workerId?.endsWith('quality')) return 'audit';
  if (e.workerId?.endsWith('fixer')) return 'fixes';
  if (e.workerId?.endsWith('researcher')) return 'research';
  return 'creation';
}
export function mapObservation(value: unknown): ActivityEvent[] {
  const e = validateObservation(value), businessId = BUSINESS_MAP[e.businessId ?? (e.workerId ? roleBusiness(e.workerId)! : 'armis')]!;
  const output: ActivityEvent[] = [];
  const emit = (type: ActivityEvent['type'], payload: Record<string, unknown>) => output.push({ id: `${e.eventId}:${output.length}`, type, sourceTs: e.occurredAt, receivedTs: 0, businessId, workerId: e.workerId ?? undefined, taskId: e.taskId ?? undefined, attemptId: e.attemptId ?? undefined, sessionId: e.sessionId ?? undefined, payload });
  const stage = stageFor(e), departmentId = e.workerId ? observedWorker(e.workerId).homeDepartmentId : undefined;
  const provider = typeof e.data.provider === 'string' ? { provider: e.data.provider, model: e.data.actualModel, capacityId: e.data.capacityPoolId, modelProvenance: 'provider_reported' } : undefined;
  if (e.type === 'task.queued' && e.taskId) emit('task.created', { title: e.source === 'hermes-metadata' ? 'Dashboard connection — integration test' : 'Observed internal task', stage, criteria: [], eligibleCapacity: [], maxRepairs: 0, parentTaskId: e.data.parentTaskId });
  if (e.type === 'attempt.started' && e.taskId && e.workerId && e.attemptId && e.sessionId) emit('task.assigned', { stage, ...(provider ? { provider } : {}) });
  if (e.source === 'hermes-metadata' && e.type === 'attempt.started' && e.workerId) {
    emit('worker.state', {state: 'active', departmentId, action: `Tool request recorded: ${e.data.tool ?? 'unknown_tool'}`});
    emit('attempt.action', {action: `Tool request recorded: ${e.data.tool ?? 'unknown_tool'}`, tool: e.data.tool});
  }
  if (e.type === 'attempt.activity' && e.workerId) {
    const action = e.source === 'hermes-metadata' ? `Tool ${e.data.phase ?? 'activity'} recorded: ${e.data.tool ?? 'unknown_tool'}; job outcome unobserved` : 'Provider process running; result not yet observed';
    emit('worker.state', { state: 'active', departmentId, action, ...(provider ? { provider } : {}) });
    if (e.attemptId) emit('attempt.action', { action });
  }
  if (e.type === 'task.started' && e.taskId) emit('task.status', { status: 'in_progress' }); // Admission is not a worker heartbeat.
  if (['task.waiting','task.held','task.failed','task.completed'].includes(e.type) && e.taskId) {
    const setupAccepted = e.source === 'armis-setup-runtime' && e.type === 'task.completed' && e.data.accepted === true;
    const status = setupAccepted ? 'ready' : e.type === 'task.waiting' ? (e.data.waitReason === 'provider' || e.data.waitReason === 'capacity' ? 'waiting_provider' : 'waiting_approval') : e.type === 'task.failed' ? 'failed' : 'held';
    if (setupAccepted) emit('task.ready', {});
    else emit('task.status', { status, reason: setupAccepted ? 'Internal setup checks accepted; not released for external action.' : e.type === 'task.held' ? 'Held: authority-bound completion not verified; inspect trusted controller locally.' : e.type === 'task.completed' ? 'Recorded result; required acceptance not observed. Not released.' : 'Observed runtime wait or failure.' });
  }
  if (['attempt.finished','attempt.expired'].includes(e.type)) {
    if (e.attemptId) emit('attempt.finished', e.source === 'armis-setup-runtime' ? {provider, outcome: e.data.outcome === 'completed' ? 'completed' : 'aborted'} : {}); // No outcome in v1. Never infer from exit.
    if (e.workerId) emit('worker.state', { state: 'unknown', departmentId });
    if (e.taskId && e.data.state === 'held') emit('task.status', { status: 'held', reason: 'Held: missing authority-bound completion.' });
    if (e.taskId && e.data.state === 'ready') emit('task.status', { status: 'held', reason: 'Local ready recorded; required authority-bound acceptance not exposed by contract v1.' });
  }
  if (['worker.idle','worker.offline','heartbeat.lost','source.stale','source.disconnected'].includes(e.type) && e.workerId) emit('worker.state', { state: e.type === 'worker.idle' ? 'idle' : e.type === 'worker.offline' ? 'offline' : 'unknown', departmentId });
  // v1 lacks explicit handoff endpoints, acceptance binding, approved preview,
  // independent quota windows and installed-profile evidence. Do not invent them.
  return output;
}
export function projectSnapshot(values: unknown[], takenAt: number): Snapshot {
  if (values.length > 10000) throw Error('Journal exceeds projection bound');
  const observations = values.map(validateObservation);
  const workers = new Map<string, Worker>();
  for (const e of observations) if (e.workerId) {
    const worker = workers.get(e.workerId) ?? observedWorker(e.workerId);
    if (e.source === 'armis-setup-runtime' && e.data.installed === true) worker.installation = {defined:true, installed:true, observed:true, roleBinding:'verified', source:`Installed persistent profile: ${e.data.profileName ?? 'verified'}`};
    workers.set(e.workerId, worker);
  }
  let state = initialState([...workers.values()], 'connected', takenAt);
  for (const e of [...observations].sort((a,b) => a.occurredAt - b.occurredAt || a.cursor - b.cursor)) state = reduce(state, { kind: 'events', events: mapObservation(e) });
  return { takenAt, workers: [...workers.values()], statuses: Object.values(state.statuses), tasks: Object.values(state.tasks), attempts: Object.values(state.attempts), artifacts: [], capacity: [], timeline: state.timeline };
}
