import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BUSINESSES, ROSTER, DEPARTMENT_BY_ID } from '../src/core/config';
import registry from '../src/core/control-registry.json';
import { ORGANIZATION_ROLES } from '../src/core/organization';
import { initialState, applyEvent, applySnapshot } from '../src/core/reducer';
import { decodeBridgeMessage } from '../src/adapters/live';
import { reconcileCity, observedSessions } from '../src/core/reconcile';
import { businessCounts, departmentCounts, STALE_AFTER_MS } from '../src/core/selectors';
import { buildInterior } from '../src/scene/interior';
import { ActorSystem } from '../src/scene/actors';
import { DemoSim } from '../src/adapters/demo/sim';
import type { ActivityEvent } from '../src/core/types';

describe('authoritative city identities', () => {
  it('represents every Control role exactly once in its declared company', () => {
    expect(ROSTER.map(w => w.id).sort()).toEqual(registry.roles.map(r => r.id).sort());
    expect(ROSTER).toHaveLength(29);
    for (const w of ROSTER) {
      const r = ORGANIZATION_ROLES.find(r => r.id === w.id)!;
      expect(w.businessId).toBe(r.businessId); expect(w.reportsTo).toBe(r.reportsTo); expect(w.mandate).toBe(r.mandate);
      expect(DEPARTMENT_BY_ID[w.homeDepartmentId]?.businessId).toBe(w.businessId);
    }
    expect(ROSTER.filter(w => w.businessId === 'hermes-hq')).toHaveLength(5);
    for (const id of ['uditus','etsy-studio','aster-ledger']) expect(ROSTER.filter(w => w.businessId === id)).toHaveLength(8);
  });
  it('reports missing identities, incorrect homes, orphaned jobs and assignments', () => {
    const s = initialState(ROSTER,'connected',1000);
    expect(reconcileCity(s)).toEqual([]);
    delete s.workers['armis.ceo'];
    s.workers['uditus.creator'] = {...s.workers['uditus.creator']!,homeDepartmentId:'etsy-studio:delivery'};
    s.statuses['uditus.researcher'] = {workerId:'uditus.researcher',state:'active',departmentId:'uditus:research',taskId:'missing',stateSince:1000,lastObservedAt:1000};
    expect(reconcileCity(s).map(i => i.code)).toEqual(expect.arrayContaining(['missing-agent','identity-mismatch','invalid-home','orphan-job']));
  });
  it('uses the same declared identities in the demo and never invents sessions', () => {
    const sim = new DemoSim(7,'steady');
    expect(Object.keys(sim.truth.workers).sort()).toEqual(ROSTER.map(w => w.id).sort());
    for (let offset = 0; offset <= 300_000; offset += 10_000) {
      sim.advanceTo(sim.loadAt + offset);
      expect(reconcileCity(sim.truth), `at ${offset}: ${JSON.stringify(reconcileCity(sim.truth).map(i => ({status:sim.truth.statuses[i.entityId],task:sim.truth.tasks[sim.truth.statuses[i.entityId]?.taskId ?? '']})))}`).toEqual([]);
    }
  });
});

describe('all declared agents have physical homes', () => {
  beforeAll(() => {
    const gradient = {addColorStop() {}};
    const ctx = new Proxy({}, {get:(_,key) => key === 'createLinearGradient' || key === 'createRadialGradient' ? () => gradient : () => {}});
    vi.stubGlobal('document',{createElement:() => ({width:0,height:0,getContext:() => ctx})});
  });
  afterAll(() => vi.unstubAllGlobals());
  for (const business of BUSINESSES) it(`${business.id}: unique lounge spots and reachable workspaces`, () => {
    const scene = buildInterior(business,{});
    const people = ROSTER.filter(w => w.businessId === business.id);
    const s = initialState(ROSTER,'connected',1000);
    const actors = new ActorSystem(scene);
    actors.update(s,1000,false);
    const positions = actors.positions();
    expect(positions).toHaveLength(people.length);
    expect(new Set(positions.map(p => p.at.join(','))).size).toBe(people.length);
    // Full sprite bounds must fit even when the entire company is resting.
    const spots = scene.lounge.map(s => scene.toScreen(s.at));
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i]!, b = spots[j]!;
      expect(Math.abs(a[0] - b[0]) >= 14 * 1.6 || Math.abs(a[1] - b[1]) >= 24 * 1.6, `lounge spots ${i} and ${j} overlap`).toBe(true);
    }
    for (const p of positions) { expect(p.target).toMatch(/^lounge:/); expect(p.state).toBe('unknown'); expect(p.moving).toBe(false); }
    for (const w of people) {
      const room = scene.rooms.find(r => r.departmentId === w.homeDepartmentId)!;
      expect(room).toBeDefined();
      expect(room.seats.length).toBeGreaterThanOrEqual(people.filter(p => p.homeDepartmentId === w.homeDepartmentId).length);
    }
    for (const w of people) s.statuses[w.id] = {workerId:w.id,state:'idle',departmentId:w.homeDepartmentId,stateSince:1000,lastObservedAt:1000};
    actors.update(s,2000,false);
    expect(actors.positions().every(p => p.target.startsWith('lounge:'))).toBe(true);
    expect(departmentCounts(s,business.id + ':lounge').idle).toBe(people.length);
    expect(businessCounts(s,business.id).roster).toBe(people.length);
  });
  it('moves observed work to a desk, freezes stale position, and returns confirmed idle to lounge', () => {
    const scene = buildInterior(BUSINESSES.find(b => b.id === 'uditus')!,{});
    const actors = new ActorSystem(scene);
    let s = initialState(ROSTER,'connected',1000);
    const event = (id:string,state:string):ActivityEvent => ({id,type:'worker.state',workerId:'uditus.creator',businessId:'uditus',sourceTs:1000,receivedTs:1000,payload:{state,departmentId:'uditus:delivery',sessionId:'session-1'}});
    s = applyEvent(s,event('working','active')); actors.update(s,1000,false);
    const active = actors.positions().find(p => p.id === 'uditus.creator')!;
    expect(active.target).toMatch(/^seat:uditus:delivery/);
    // Worker-state envelope uses session identity, not payload guesswork.
    expect(observedSessions(s,'uditus')).toBe(0);
    s = {...s,now:1000 + STALE_AFTER_MS + 1}; actors.update(s,2000,true);
    const stale = actors.positions().find(p => p.id === 'uditus.creator')!;
    expect(stale.at).toEqual(active.at); expect(stale.state).toBe('unknown'); expect(stale.moving).toBe(false);
    s = applyEvent({...s,now:1000},{...event('rest','idle'),sourceTs:2000}); actors.update(s,3000,false);
    expect(actors.positions().find(p => p.id === 'uditus.creator')!.target).toMatch(/^lounge:/);
  });
  it('projects validated telemetry through the reducer into occupancy and session counts', () => {
    const sim = new DemoSim(7,'steady');
    sim.advanceTo(sim.loadAt + 2000);
    const snapshot = sim.snapshot();
    const decoded = decodeBridgeMessage(JSON.stringify({type:'snapshot',snapshot}),snapshot.takenAt);
    expect(decoded?.type).toBe('snapshot');
    if (decoded?.type !== 'snapshot') throw new Error('Telemetry fixture rejected');
    let state = applySnapshot(initialState(ROSTER,'disconnected',snapshot.takenAt),decoded.snapshot,'connected');
    const scene = buildInterior(BUSINESSES.find(b => b.id === 'uditus')!,{});
    const actors = new ActorSystem(scene);
    actors.update(state,state.now,false);
    for (const w of ROSTER.filter(w => w.businessId === 'uditus')) {
      const status = state.statuses[w.id];
      const actor = actors.positions().find(p => p.id === w.id)!;
      if (status?.state === 'active') expect(actor.target).toMatch(/^seat:/);
      else expect(actor.target).toMatch(/^lounge:/);
    }
    const sessions = new Set(Object.values(state.statuses).filter(s => s.workerId.startsWith('uditus.') && s.state === 'active' && s.sessionId).map(s => s.sessionId));
    expect(observedSessions(state,'uditus')).toBe(sessions.size);
    expect(reconcileCity(state)).toEqual([]);
    const working = Object.values(state.statuses).find(s => s.workerId.startsWith('uditus.') && s.state === 'active')!;
    const message = decodeBridgeMessage(JSON.stringify({type:'events',events:[{id:'observed-rest',type:'worker.state',businessId:'uditus',workerId:working.workerId,sourceTs:state.now + 1,payload:{state:'idle',departmentId:'uditus:lounge'}}]}),state.now + 1);
    if (message?.type !== 'events') throw new Error('Observed idle event rejected');
    state = applyEvent(state,message.events[0]!); actors.update(state,state.now + 1,false);
    expect(actors.positions().find(p => p.id === working.workerId)!.target).toMatch(/^lounge:/);
    expect(observedSessions(state,'uditus')).toBe(sessions.size - 1);
    expect(reconcileCity(state)).toEqual([]);
    const before = actors.positions();
    state = {...state,connection:'reconnecting'}; actors.update(state,state.now + 2,true);
    expect(actors.positions().every(p => p.state === 'unknown' && !p.moving)).toBe(true);
    expect(actors.positions().map(p => p.at)).toEqual(before.map(p => p.at));
    expect(observedSessions(state,'uditus')).toBe(0);
  });
});
