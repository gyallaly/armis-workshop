import { expect, it } from 'vitest';
import { initialState, reduce } from '../src/core/reducer';
it('finished attempt without acceptance reports outcome not observed, never undefined', () => {
  const state = reduce(initialState([], 'connected', 1000), {kind: 'events', events: [{id:'finished1',type:'attempt.finished',businessId:'hermes-hq',attemptId:'attempt1',sourceTs:1000,receivedTs:1000,payload:{}}]});
  expect(state.timeline.at(-1)?.text).toContain('outcome not observed');
  expect(state.timeline.at(-1)?.text).not.toContain('undefined');
});
