import { describe, expect, it } from 'vitest';
import { ROSTER } from '../src/core/config';
import { initialState } from '../src/core/reducer';
import { buildingSignals, delegationPulses, jobVisual } from '../src/scene/operations';
import { DemoSim } from '../src/adapters/demo/sim';

describe('operational city visuals',()=> {
  it('counts agents once and never lights unknown execution',()=> {
    const state=initialState(ROSTER,'connected',1000);
    const workers=ROSTER.filter(w=>w.businessId==='hermes-hq');
    for(const [i,w] of workers.entries()) state.statuses[w.id]={workerId:w.id,state:(['active','idle','waiting_approval','failed','offline'] as const)[i]!,departmentId:w.homeDepartmentId,stateSince:1000,lastObservedAt:1000};
    expect(buildingSignals(state,'hermes-hq')).toEqual({counts:[1,2,1,1],unknown:0});
    expect(buildingSignals({...state,connection:'disconnected'},'hermes-hq')).toEqual({counts:[0,0,0,0],unknown:5});
  });
  it('derives folio progress from criteria and distinguishes review and failure',()=> {
    const sim=new DemoSim(7,'steady');
    const task=Object.values(sim.truth.tasks)[0]!;
    expect(jobVisual({...task,status:'in_progress',stage:'creation',acceptanceCriteria:[]})).toMatchObject({progress:null,mark:''});
    expect(jobVisual({...task,stage:'audit',acceptanceCriteria:[{text:'A',state:'met'},{text:'B',state:'pending'}]})).toMatchObject({progress:0.5,mark:'?'});
    expect(jobVisual({...task,status:'failed'}).mark).toBe('!');
  });
  it('expires assignment pulses and suppresses disconnected activity',()=> {
    const sim=new DemoSim(7,'steady');
    let count=0;
    for(let offset=0;offset<80000;offset+=500) {
      sim.advanceTo(sim.loadAt+offset);
      for(const id of ['uditus','etsy-studio','aster-ledger']) {
        const pulses=delegationPulses(sim.truth,id,sim.truth.now);
        count+=pulses.length;
        expect(pulses.every(p=>p.progress>=0 && p.progress<1 && p.from!==p.to)).toBe(true);
        expect(delegationPulses({...sim.truth,connection:'disconnected'},id,sim.truth.now)).toEqual([]);
        expect(delegationPulses(sim.truth,id,sim.truth.now+1800)).toEqual([]);
      }
    }
    expect(count).toBeGreaterThan(0);
  });
});
