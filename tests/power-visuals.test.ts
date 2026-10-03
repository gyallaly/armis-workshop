import { describe,expect,it } from 'vitest';
import { pipeWidth,reactorState,reactorQuota,effectivePowerPolicies } from '../src/core/powerVisuals';
import type { ProviderCapacity } from '../src/core/types';

const cap:ProviderCapacity={id:'account',provider:'example',scope:{kind:'account',label:'shared'},models:[],modelsIllustrative:false,availability:{value:'available',provenance:'provider_reported'},remaining:{value:12,provenance:'provider_reported',unit:'requests'},resetAt:{value:null,provenance:'unknown'},local:{requests:{value:0,provenance:'locally_measured'},tokens:{value:0,provenance:'locally_measured'},windowLabel:'observed'},lastCheckedAt:1000};
describe('reactor evidence and allocation encoding',()=>{
  it('does not energize buildings from an unverified or pending live policy',()=>{
    const control={source:'live' as const,companies:{uditus:{lifecycle:'running' as const,weight:25,maxConcurrent:1}},capabilities:{companyControl:false},receipts:[] as {type:string;state:string}[]};
    expect(effectivePowerPolicies(control).uditus?.lifecycle).toBe('unknown');
    expect(effectivePowerPolicies({...control,capabilities:{companyControl:true},receipts:[{type:'allocation.set',state:'acknowledged'}]}).uditus?.lifecycle).toBe('unknown');
    expect(effectivePowerPolicies({...control,capabilities:{companyControl:true}}).uditus?.weight).toBe(25);
  });
  it('never lights disconnected, stale, or future evidence',()=>{
    expect(reactorState(cap,{connection:'disconnected',now:1000})).toBe('unknown');
    expect(reactorState(cap,{connection:'connected',now:92000})).toBe('unknown');
    expect(reactorState({...cap,lastCheckedAt:40000},{connection:'connected',now:1000})).toBe('unknown');
  });
  it('distinguishes explicit exhaustion, throttling and unknown',()=>{
    const state={connection:'connected' as const,now:1000};
    expect(reactorState(cap,state)).toBe('available');
    expect(reactorState({...cap,remaining:{value:0,provenance:'provider_reported'}},state)).toBe('fault');
    expect(reactorState({...cap,availability:{value:'limited',provenance:'provider_reported'}},state)).toBe('warning');
    expect(reactorState({...cap,availability:{value:'unknown',provenance:'unknown'}},state)).toBe('unknown');
  });
  it('encodes effective allocation with bounded widths and disconnects stopped policies',()=>{
    expect(pipeWidth({lifecycle:'running',weight:80,maxConcurrent:2})).toBeGreaterThan(pipeWidth({lifecycle:'running',weight:10,maxConcurrent:2}));
    expect(pipeWidth({lifecycle:'stopped',weight:80,maxConcurrent:2})).toBe(1);
    expect(pipeWidth({lifecycle:'running',weight:10000,maxConcurrent:2})).toBe(7);
  });
  it('requires comparable fresh window totals and uses the tightest remaining limit',()=>{
    const window={id:'requests',label:'reported window',unit:'requests' as const,total:{value:100,provenance:'provider_reported' as const},remaining:{value:10,provenance:'provider_reported' as const},resetAt:{value:null,provenance:'unknown' as const},observedAt:1000};
    const state={connection:'connected' as const,now:1000};
    expect(reactorQuota({...cap,quotaWindows:[window]},state)).toBe(.1);
    expect(reactorState({...cap,quotaWindows:[window]},state)).toBe('warning');
    expect(reactorQuota({...cap,quotaWindows:[{...window,total:{value:null,provenance:'unknown'}}]},state)).toBeNull();
    expect(reactorQuota({...cap,quotaWindows:[window]}, {...state,now:92000})).toBeNull();
  });
});
