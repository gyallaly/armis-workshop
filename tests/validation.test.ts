import { describe, expect, it } from 'vitest';
import { normalizeEvent, normalizeSnapshot } from '../src/core/normalize';
import { DemoSim } from '../src/adapters/demo/sim';
import { ROSTER } from '../src/core/config';

const event = (type = 'worker.state', payload: unknown = { state: 'active' }) => ({
  id: 'event-1', type, sourceTs: 1000, receivedTs: 1001, businessId: 'uditus', workerId: 'w-kai', taskId: 'task-1', attemptId: 'attempt-1', sessionId: 'session-1', payload,
});

const emptySnapshot = () => ({ takenAt: 1000, workers: [], statuses: [], tasks: [], attempts: [], artifacts: [], capacity: [] });

describe('runtime snapshot validation', () => {
  it('deep-validates Demo-only ledger and redirect records without leaking extra fields', () => {
    const sim = new DemoSim(7, 'steady');
    sim.advanceTo(sim.loadAt + 120000);
    const snap = sim.snapshot();
    expect(normalizeSnapshot(snap)).toEqual(snap);
    const book = Object.values(sim.truth.ledger)[0]!;
    expect(normalizeEvent(event('ledger.updated', { book: { ...book, credentials: 'private' } }))?.payload).toEqual({ book });
    expect(normalizeEvent(event('ledger.updated', { book: { ...book, news: [{ ...book.news[0], headline: 'token=private' }] } }))).toBeNull();
    expect(normalizeEvent(event('ledger.updated', { book: { ...book, candidates: { bad: { quotes: Array(65).fill({}) } } } }))).toBeNull();
    expect(normalizeSnapshot({ ...emptySnapshot(), redirects: [{ id: 'r', workerId: 'w', taskId: 't', instruction: 'Inspect contrast', state: 'requested', simulated: true, history: [] }] })?.redirects).toHaveLength(1);
    expect(normalizeSnapshot({ ...emptySnapshot(), redirects: [{ id: 'r', workerId: 'w', taskId: 't', instruction: 'password=private', state: 'requested', simulated: true, history: [] }] })).toBeNull();
  });

  it('validates optional capacity windows without stripping their observation metadata', () => {
    const sim = new DemoSim(7, 'steady');
    sim.advanceTo(sim.loadAt);
    const base = Object.values(sim.truth.capacity)[0]!;
    const window = { id: 'daily', label: 'Daily requests', scope: 'shared', unit: 'requests', remaining: { value: 20, provenance: 'provider_reported' }, limit: { value: 100, provenance: 'provider_reported' }, resetAt: { value: 2000, provenance: 'provider_reported' }, observedAt: 1000, source: 'rate-limit header', maxAgeMs: 60000 };
    const cap = { ...base, windows: [window], configured: true, source: 'provider headers', maxAgeMs: 60000 };
    expect(normalizeEvent(event('capacity.updated', { capacity: cap }))?.payload).toEqual({ capacity: cap });
    for (const bad of [{ ...cap, windows: Array(65).fill(window) }, { ...cap, maxAgeMs: -1 }, { ...cap, windows: [{ ...window, unit: 'imagined' }] }, { ...cap, windows: [{ ...window, remaining: { value: NaN, provenance: 'provider_reported' } }] }, { ...cap, windows: [{ ...window, source: 'token=private' }] }, { ...cap, availability: { value: 'available', provenance: 'imagined' } }]) expect(normalizeSnapshot({ ...emptySnapshot(), capacity: [bad] })).toBeNull();
  });
  it('validates complete snapshots atomically and never supplies missing collections', () => {
    expect(normalizeSnapshot(emptySnapshot())).toEqual(emptySnapshot());
    expect(normalizeSnapshot({ ...emptySnapshot(), workers: ROSTER, prompts: 'private' })).toEqual({ ...emptySnapshot(), workers: ROSTER });
    for (const raw of [null, [], {}, { ...emptySnapshot(), takenAt: Infinity }, { ...emptySnapshot(), tasks: undefined }, { ...emptySnapshot(), statuses: [{}] }, { ...emptySnapshot(), workers: [{ ...ROSTER[0], name: 'password=private' }] }, { ...emptySnapshot(), tasks: Array(121).fill({}) }, { ...emptySnapshot(), timeline: Array(301).fill({}) }]) expect(normalizeSnapshot(raw)).toBeNull();
    const sim = new DemoSim(7, 'steady');
    sim.advanceTo(sim.loadAt + 120_000);
    const snapshot = { takenAt: sim.t, workers: Object.values(sim.truth.workers), statuses: Object.values(sim.truth.statuses), tasks: Object.values(sim.truth.tasks), attempts: Object.values(sim.truth.attempts), artifacts: Object.values(sim.truth.artifacts), capacity: Object.values(sim.truth.capacity), timeline: sim.truth.timeline };
    expect(normalizeSnapshot(snapshot)).toEqual(snapshot);
    const task = snapshot.tasks[0]!;
    for (const corrupted of [{ ...task, stage: 'invented' }, { ...task, repairCount: -1 }, { ...task, acceptanceCriteria: [{ text: 'Claim', state: 'invented' }] }, { ...task, attemptIds: ['__proto__'] }, { ...task, eligibleCapacity: Array(65).fill('cap') }, { ...task, heldReason: 'Authorization: Bearer private' }]) expect(normalizeSnapshot({ ...snapshot, tasks: [corrupted] })).toBeNull();
  });
});

describe('runtime event validation', () => {
  it('preserves mandate provenance and an explicitly unobserved attempt outcome', () => {
    const created = event('task.created', { title: 'Observed task', stage: 'research', criteria: [], eligibleCapacity: [], maxRepairs: 0, mandateId: 'mandate-1', source: 'durable_job' });
    expect(normalizeEvent(created)).toEqual(created);
    expect(normalizeEvent(event('attempt.finished', {}))).toEqual(event('attempt.finished', {}));
    const task = { id: 'task-1', businessId: 'uditus', title: 'Observed task', acceptanceCriteria: [], stage: 'research', status: 'queued', attemptIds: [], findings: [], artifactIds: [], repairCount: 0, maxRepairs: 0, eligibleCapacity: [], createdAt: 1000, updatedAt: 1000, mandateId: 'mandate-1', source: 'durable_job' };
    expect(normalizeSnapshot({ ...emptySnapshot(), tasks: [task] })?.tasks).toEqual([task]);
    expect(normalizeEvent(event('task.created', { ...created.payload as object, source: 'token=private' }))).toBeNull();
  });
  it('rejects secret-like values anywhere in observable event content', () => {
    const secrets = ['sk-test-secret', 'ghp_example123456', 'Cookie: session=abcdef', 'API_KEY = "private-value"', 'apiKey: private-value', 'client_secret=private', 'access_token=private', 'https://example.test/?token=private'];
    for (const value of secrets) {
      expect(normalizeEvent(event('task.created', { title: value }))).toBeNull();
      expect(normalizeEvent(event('audit.findings', { findings: [{ id: 'finding', severity: 'minor', summary: value, resolved: false }] }))).toBeNull();
      expect(normalizeEvent(event('artifact.recorded', { artifact: { id: 'artifact', taskId: 'task-1', kind: 'log', title: 'Evidence', preview: value, recordedAt: 1000, illustrative: false } }))).toBeNull();
      expect(normalizeEvent(event('worker.state', { state: 'active', provider: { provider: value, modelProvenance: 'unknown' } }))).toBeNull();
    }
  });
  it('copies only allowlisted fields and rejects dangerous display strings and ids', () => {
    const raw = { ...event(), prompt: 'private', credentials: { token: 'private' }, payload: { state: 'active', reasoning: 'private', provider: { provider: 'Codex', modelProvenance: 'unknown', apiKey: 'private' } } };
    expect(normalizeEvent(raw)).toEqual(event('worker.state', { state: 'active', provider: { provider: 'Codex', modelProvenance: 'unknown' } }));
    for (const action of ['Authorization: Bearer abcdef0123456789', 'sk-proj-abcdefghijk123456789', 'token=private-value', '-----BEGIN PRIVATE KEY-----', 'https://user:password@example.com', 'ghp_123456789012345678901234567890123456', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signature', 'a'.repeat(513)]) {
      expect(normalizeEvent(event('attempt.action', { action }))).toBeNull();
    }
    for (const id of ['__proto__', 'constructor', 'prototype', 'a'.repeat(129)]) expect(normalizeEvent({ ...event(), id })).toBeNull();
  });

  it('validates required event-specific fields and bounded collections', () => {
    for (const raw of [event('audit.findings', { findings: [{ id: 'f', severity: 'invented', summary: 'Issue', resolved: false }] }), event('criteria.updated', { criteria: [{ text: 'Checked', state: 'invented' }] }), event('task.handoff', { from: 'audit', to: 'imagined', outcome: 'handoff' }), event('attempt.finished', { outcome: 'invented' }), event('artifact.recorded', { artifact: {} }), event('task.created', { title: 'Task', criteria: Array(65).fill('criterion') }), { ...event('task.ready', {}), taskId: undefined }]) expect(normalizeEvent(raw)).toBeNull();
    expect(normalizeEvent(event('criteria.updated', { criteria: [{ text: 'Checked', state: 'met' }] }))?.payload).toEqual({ criteria: [{ text: 'Checked', state: 'met' }] });
  });
  it('rejects malformed envelopes and payloads without inventing defaults', () => {
    for (const raw of [null, [], 1, {}, { ...event(), sourceTs: -1 }, { ...event(), receivedTs: NaN }, { ...event(), businessId: '' }, event('worker.state', []), event('worker.state', {}), event('worker.state', { state: 'invented' }), event('task.created', { title: 123 })]) {
      expect(normalizeEvent(raw as never)).toBeNull();
    }
  });
});
