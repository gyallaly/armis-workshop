import { expect, it } from 'vitest';
import { DemoSim } from '../src/adapters/demo/sim';
import { normalizeEvent } from '../src/core/normalize';
import { initialState, reduce } from '../src/core/reducer';

it('a Demo redirect acknowledgement survives validation and updates the existing request', () => {
  const sim = new DemoSim(7, 'steady');
  sim.advanceTo(sim.loadAt);
  const status = Object.values(sim.truth.statuses).find(s => s.state === 'active' && s.taskId)!;
  const request = {id:'rd-regression',workerId:status.workerId,taskId:status.taskId!,instruction:'Check keyboard navigation first.',state:'requested' as const,simulated:true,history:[{state:'requested' as const,at:sim.t}]};
  let state = reduce(initialState([], 'demo', sim.t), {kind:'snapshot',snapshot:sim.snapshot(),connection:'demo'});
  state = reduce(state, {kind:'redirect.request',request});
  sim.redirect(request);
  const events = sim.advanceTo(sim.t + 1500);
  const ack = events.find(e => e.type === 'redirect.acknowledged')!;
  expect(ack).toBeDefined();
  expect(normalizeEvent(ack)).not.toBeNull();
  expect(normalizeEvent(ack)?.payload.redirectId).toBe(request.id);
  state = reduce(state, {kind:'events',events});
  expect(state.redirects[request.id]?.state).toBe('acknowledged');
});
