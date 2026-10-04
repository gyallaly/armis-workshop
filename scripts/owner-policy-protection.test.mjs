import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OwnerPolicy, EXECUTION_PATHS } from '../server/owner-policy.mjs';
const executor = { capabilities: async () => ({ verified:true, covered:EXECUTION_PATHS, chat:true }), policy:async()=>({applied:true}), cancel:async()=>({stopped:true,residualUsage:false}) };
const proof = () => ({verified:true,covered:EXECUTION_PATHS});
function fixture(t, ex=executor, verify=proof) {
 const dir=mkdtempSync(join(process.env.TMPDIR || '/home/connor/.hermes/cache/scratch','policy-protection-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,'policy.json');return {path,p:new OwnerPolicy(path,ex,verify)};
}
const command=(p,type,businessId,extras={})=>({id:crypto.randomUUID(),expectedRevision:p.state.revision,expiresAt:Date.now()+60000,type,businessId,...extras});
test('blanket verifier and partial independent coverage cannot enable full controls',async t=>{
 const {p}=fixture(t,executor,()=>({verified:true}));assert.equal((await p.coverage()).verified,false);
 p.verifyExecution=()=>({verified:true,covered:['workers']});
 const c=await p.coverage();assert.equal(c.verified,false);assert.deepEqual(c.covered,['workers']);
 await assert.rejects(p.admit({id:'unsupported',businessId:'uditus',provider:'fake'}),/coverage/);
});
test('stop fences a duplicate active reservation immediately and on restart',async t=>{
 const {p,path}=fixture(t,null);const request={id:'active',businessId:'uditus',provider:'fake',tokens:10};p.reserve(request);
 const stopped=p.command(command(p,'company.stop','uditus'));
 assert.throws(()=>p.reserve(request),/holds/);await stopped;
 assert.throws(()=>new OwnerPolicy(path).reserve(request),/holds/);
});
test('same command ID is bound before remote checks; conflicting replay cannot broaden stop',async t=>{
 let unblock;const pending=new Promise(r=>unblock=r);const {p}=fixture(t,{...executor,capabilities:()=>pending});
 const c=command(p,'company.stop','uditus');const first=p.command(c);const replay=p.command({...c});
 await assert.rejects(p.command({...c,type:'global.stop'}),/reused/);assert.equal(p.state.globalStopped,false);
 unblock(await executor.capabilities());assert.deepEqual(await first,await replay);
});
test('caller mutation cannot change a queued command',async t=>{
 let unblock;const pending=new Promise(r=>unblock=r);const {p}=fixture(t,{...executor,capabilities:()=>pending});
 const c=command(p,'company.stop','uditus');const result=p.command(c);c.type='global.stop';c.businessId='etsy-studio';
 unblock(await executor.capabilities());assert.equal((await result).type,'company.stop');assert.equal(p.state.globalStopped,false);
});
test('pending command after restart is not re-executed',async t=>{
 let unblock;const pending=new Promise(r=>unblock=r);const {p,path}=fixture(t,{...executor,capabilities:()=>pending});
 const c=command(p,'company.stop','uditus');const running=p.command(c);
 const restarted=new OwnerPolicy(path,executor,proof);const replay=await restarted.command(c);
 assert.equal(replay.state,'acknowledged');assert.match(replay.reason,/reconciliation/);
 assert.throws(()=>restarted.reserve({id:'new',businessId:'uditus',provider:'fake'}),/holds/);
 unblock(await executor.capabilities());await running;
});
test('receipt pruning does not forget command replay identity',async t=>{
 const {p,path}=fixture(t);const c=command(p,'company.pause','uditus');const receipt=await p.command(c);
 p.state.receipts=[];p.persist();const restarted=new OwnerPolicy(path,executor,proof);
 assert.deepEqual(await restarted.command(c),JSON.parse(JSON.stringify(receipt)));await assert.rejects(restarted.command({...c,type:'company.resume'}),/reused/);
});
test('global stop cancels owner reserve even when company cancellation fails',async t=>{
 const calls=[];const {p}=fixture(t,{...executor,cancel:async id=>{calls.push(id);return {stopped:id!=='uditus',residualUsage:id==='uditus'};}});
 p.reserve({id:'owner',businessId:'owner-services',provider:'fake',tokens:20,costMicros:5});
 const r=await p.command(command(p,'global.stop'));assert.equal(r.state,'acknowledged');assert.ok(calls.includes('owner-services'));
 assert.equal(p.state.ownerReserve.lifecycle,'stopped');assert.equal(p.state.ownerReserve.consumedTokens,20);
 assert.equal(p.state.companies.uditus.lifecycle,'stopping');assert.throws(()=>p.reserve({id:'owner-next',businessId:'owner-services',provider:'fake'}),/holds/);
});
test('malformed usage cannot erase reservation or refund consumption',t=>{
 const {p}=fixture(t);p.reserve({id:'usage',businessId:'uditus',provider:'fake',tokens:20,costMicros:10});
 assert.throws(()=>p.release('usage',{tokens:null,costMicros:0}),/usage/);assert.equal(p.state.reservations.length,1);
 p.release('usage',{tokens:30,costMicros:15});assert.equal(p.state.companies.uditus.consumedTokens,30);
 p.release('usage',{tokens:30,costMicros:15});assert.equal(p.state.companies.uditus.consumedRequests,1);
 assert.throws(()=>p.release('usage',{tokens:31,costMicros:15}),/conflict/);
});
test('safe integer overflow fails without mutating counters',t=>{
 const {p}=fixture(t);p.state.companies.uditus.consumedTokens=Number.MAX_SAFE_INTEGER;
 p.reserve({id:'overflow',businessId:'uditus',provider:'fake',tokens:0});
 assert.throws(()=>p.release('overflow',{tokens:1,costMicros:0}),/overflow/);assert.equal(p.state.reservations.length,1);
});
test('restart holds unacknowledged allocation independent of receipt history',async t=>{
 const {p,path}=fixture(t,{...executor,policy:async()=>({applied:false})});
 await p.command(command(p,'allocation.set','uditus',{allocation:{weight:25,maxConcurrent:1,tokenLimit:100}}));
 p.state.receipts=[];p.persist();const restarted=new OwnerPolicy(path,executor,proof);
 assert.throws(()=>restarted.reserve({id:'held',businessId:'uditus',provider:'fake'}),/reconciliation/);
});
test('durable storage contains stop fences before executor cancellation',async t=>{
 let path;const {p,path:store}=fixture(t,{...executor,cancel:async()=>{const s=JSON.parse(readFileSync(path,'utf8'));assert.equal(s.globalStopped,true);assert.equal(s.ownerReserve.lifecycle,'stopping');return {stopped:false,residualUsage:true};}});path=store;
 await p.command(command(p,'global.stop'));assert.equal(p.state.globalStopped,true);
});
test('unknown reservation cost is not a zero upper bound and holds finite budgets',t=>{
 const {p,path}=fixture(t);p.reserve({id:'unknown',businessId:'owner-services',provider:'fake',tokens:null,costMicros:null,requests:null});
 assert.equal(p.state.reservations[0].costMicros,null);
 p.release('unknown',{tokens:7});assert.equal(p.state.ownerReserve.consumedTokens,7);assert.equal(p.state.completedReservations.unknown.costMicros,null);assert.equal(p.state.ownerReserve.unknownCost,true);
 const restarted=new OwnerPolicy(path,executor,proof);restarted.state.ownerReserve.spendLimitMicros=100;
 assert.throws(()=>restarted.reserve({id:'next',businessId:'owner-services',provider:'fake',tokens:10,costMicros:1}),/unknown|bound/);
});
test('missing cost upper bound cannot pass finite spend ceiling',t=>{
 const {p}=fixture(t);p.state.ownerReserve.spendLimitMicros=100;
 assert.throws(()=>p.reserve({id:'missing',businessId:'owner-services',provider:'fake',tokens:5}),/bound/);
});
