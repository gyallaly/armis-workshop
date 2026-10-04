import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OwnerPolicy } from '../server/owner-policy.mjs';
const all=['owner-chat','main-chat','auxiliary-models','executives','workers','delegations','schedules','retries','provider-adapters','tool-processes'];
const store=()=>join(mkdtempSync(join(tmpdir(),'installed-policy-')),'policy.json');
const command=(p,type,businessId)=>({id:crypto.randomUUID(),expectedRevision:p.state.revision,expiresAt:Date.now()+60000,type,businessId});
const executor={capabilities:async()=>({verified:true,covered:all,chat:true}),policy:async()=>({applied:true}),cancel:async()=>({stopped:true,residualUsage:false})};
const fixtureProof=()=>({verified:true,covered:all,reason:'Independent fake-executor fixture checks, not installed evidence'});
test('stop fences immediately before a slow remote capability check',async()=>{
 let unblock;const pending=new Promise(r=>unblock=r);const p=new OwnerPolicy(store(),{...executor,capabilities:()=>pending},fixtureProof);
 const result=p.command(command(p,'company.stop','uditus'));
 assert.throws(()=>p.reserve({id:'new',businessId:'uditus',provider:'fake'}),/holds/);
 unblock({verified:true,covered:all});await result;
});
test('global resume preserves a pre-existing Uditus pause',async()=>{
 const p=new OwnerPolicy(store(),executor,fixtureProof);
 await p.command(command(p,'company.pause','uditus'));
 await p.command(command(p,'global.stop'));
 await p.command(command(p,'global.resume'));
 assert.equal(p.state.companies.uditus.lifecycle,'draining');
 assert.throws(()=>p.reserve({id:'uditus-work',businessId:'uditus',provider:'fake'}),/holds/);
 assert.doesNotThrow(()=>p.reserve({id:'owner',businessId:'owner-services',provider:'fake'}));
});
test('executor capability advertisement without independent installed checks stays disabled',async()=>{
 const p=new OwnerPolicy(store(),executor,()=>({verified:false,reason:'Installed checks missing'}));
 const view=await p.view();assert.equal(view.capabilities.companyControl,false);assert.equal(view.capabilities.chat,false);assert.match(view.coverage.reason,/Installed checks/);
});
test('a reconciled reservation ID cannot execute again after restart',()=>{
 const path=store(),p=new OwnerPolicy(path,executor,fixtureProof);
 p.reserve({id:'once',businessId:'uditus',provider:'fake'});p.release('once');
 const restarted=new OwnerPolicy(path,executor,fixtureProof);
 assert.throws(()=>restarted.reserve({id:'once',businessId:'uditus',provider:'fake'}),/reconciled/);
});
