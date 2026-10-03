import { expect, it } from 'vitest';
import { projectSnapshot, mapObservation } from '../src/adapters/live/projection';
const observation = (type: string, n: number, data = {}) => ({ version: 1, mode: 'live', cursor: n, eventId: `runtime:${n}`, source: 'hermes-workflow', occurredAt: 1000 + n, businessId: 'uditus', workerId: 'uditus.creator', taskId: 'task1', attemptId: 'attempt1', sessionId: 'session1', mandateId: 'mandate1', type, data });
it('projects only actually observed roles, separates attempt and session, keeps completion held', () => {
  const s = projectSnapshot([observation('task.queued', 1), observation('attempt.started', 2), observation('attempt.activity', 3), observation('attempt.finished', 4), observation('task.held', 5)], 2000);
  expect(s.workers.map(w => w.id)).toEqual(['uditus.creator']);
  expect(s.attempts[0]).toMatchObject({ id: 'attempt1', sessionId: 'session1' });
  expect(s.attempts[0]?.outcome).toBeUndefined();
  expect(s.tasks[0]?.status).toBe('held');
  expect(s.tasks[0]?.heldReason).toContain('authority');
  expect(s.artifacts).toEqual([]);
});
it('does not use registry definitions or bridge connectivity as worker activity', () => {
  expect(projectSnapshot([], 2000).workers).toEqual([]);
  expect(mapObservation(observation('source.connected', 1))).toEqual([]);
});
it('rejects secret metadata and mismatched role business without deriving identities from prose', () => {
  expect(() => projectSnapshot([observation('task.started', 1, { actualModel: 'sk-abcdefghijklmnopqrstuvwxyz123456' })], 2000)).toThrow();
  expect(() => projectSnapshot([{ ...observation('task.started', 1), businessId: 'armis' }], 2000)).toThrow();
});
it('maps observed unbound Hermes profile activity without claiming installation, an Armis identity or success', () => {
  const native = { ...observation('task.queued', 1), source: 'hermes-metadata', businessId: 'armis', workerId: 'hermes.default', mandateId: null };
  const start = { ...native, type: 'attempt.started', cursor: 2, eventId: 'native:2', occurredAt: 1002, data: { tool:'terminal', requestedModel:'configured-model' } };
  const snapshot = projectSnapshot([native,start],2000);
  expect(snapshot.workers[0]).toMatchObject({id:'hermes.default',installation:{installed:null,observed:true,roleBinding:'unbound',source:'Explicitly bound default-profile session metadata'}});
  expect(snapshot.statuses[0]?.state).toBe('active');
  expect(snapshot.statuses[0]?.action).toContain('terminal');
  expect(snapshot.tasks[0]?.title).toContain('integration test');
  expect(snapshot.attempts[0]?.outcome).toBeUndefined();
});
it('maps actual artifact handoff only when destination is observed, never invents route', () => {
  expect(mapObservation(observation('artifact.handed-off', 1))).toEqual([]);
});
