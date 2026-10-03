import {test,expect} from 'vitest';
import {LiveAdapter} from '../src/adapters/live/liveAdapter';
import {diagnostics} from '../src/core/connections';
const sink={reset:()=>{},snapshot:()=>{},events:()=>{},connection:()=>{},tick:()=>{}};
test('native adapter accepts genuine supplemental reports without changing task events; ignores stopped-generation responses',async()=>{
 const now=1000,listeners:Record<string,(e:{data:string})=>void>={};let finish:((v:Response)=>void)|undefined;
 const adapter=new LiveAdapter({now:()=>now,createStream:()=>({addEventListener:(k,h)=>{listeners[k]=h;},onerror:null,close:()=>{}}),fetchEvidence:()=>new Promise(r=>{finish=r;})});
 adapter.start(sink);
 finish!(new Response(JSON.stringify({reports:[{id:'integrations',status:'ok',checkedAt:now,lastRecordAt:null,records:3,source:'Real bound source',detail:'Read succeeded'}]})));
 await new Promise(r=>setTimeout(r,0));expect(diagnostics.get().feeds.integrations).toMatchObject({status:'ok',source:'Real bound source'});
 listeners.snapshot!({data:JSON.stringify({version:1,epoch:'epoch',cursor:0,mode:'live',observations:[]})});
 expect(diagnostics.get().feeds.integrations).toBeDefined();adapter.stop();
 let finishLate:((v:Response)=>void)|undefined;
 const late=new LiveAdapter({createStream:()=>({addEventListener:()=>{},onerror:null,close:()=>{}}),fetchEvidence:()=>new Promise(r=>{finishLate=r;})});
 late.start(sink);late.stop();diagnostics.reset();finishLate!(new Response(JSON.stringify({reports:[{id:'ledger',status:'ok',checkedAt:Date.now(),lastRecordAt:null,records:1,source:'Late',detail:'Must not apply'}]})));
 await new Promise(r=>setTimeout(r,0));expect(diagnostics.get().feeds.ledger).toBeUndefined();
});
