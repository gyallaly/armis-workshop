import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createViewerServer } from '../server/index.ts';
import { loopbackFetch } from './loopback-fetch.mjs';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { checkMacConnection } from './check-mac-connection.mjs';
test('loopback cookie and CSRF boundary; capabilities never green without executor',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'armis-http-'));writeFileSync(join(dir,'index.html'),'<html>fixture</html>');
 const server=createViewerServer({dist:dir,policyPath:join(dir,'policy.json'),port:0});await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try {
  assert.equal((await fetch(base+'/api/control')).status,401);
  const page=await loopbackFetch(base+'/',{headers:{'Sec-Fetch-Site':'none','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}});const cookie=page.headers.get('set-cookie').split(';')[0];await page.body.cancel();
  const state=await(await fetch(base+'/api/control',{headers:{Cookie:cookie}})).json();assert.equal(state.capabilities.chat,false);assert.equal(state.capabilities.companyControl,false);assert.equal(state.coverage.uncovered.length,8);
  const command={id:'stop1',type:'company.stop',businessId:'uditus',expectedRevision:0,expiresAt:Date.now()+60000};
  assert.equal((await fetch(base+'/api/control/commands',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(command)})).status,403);
  const response=await fetch(base+'/api/control/commands',{method:'POST',headers:{Cookie:cookie,Origin:base,'X-Armis-Owner':'1','Content-Type':'application/json'},body:JSON.stringify(command)});assert.equal((await response.json()).state,'rejected');
  assert.equal((await fetch(base+'/api/control',{headers:{Cookie:cookie,Origin:'http://malicious.example'}})).status,403);
  assert.equal((await fetch(base+'/api/admission',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true});}
});
test('real installed named transport and gated configured chat idempotence',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'armis-live-'));writeFileSync(join(dir,'index.html'),'<html>fixture</html>');
 const db=new DatabaseSync(join(dir,'runtime.db'));db.exec('CREATE TABLE viewer_events(cursor INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL,body TEXT NOT NULL)');db.close();
 let calls=0;
 const executor=createServer(async(req,res)=>{assert.equal(req.headers.authorization,'Bearer fixture-secret');res.setHeader('Content-Type','application/json');if(req.url==='/capabilities'){res.end(JSON.stringify({verified:true,chat:true,recipient:'Fixture Hermes',covered:['owner-chat','executives','workers','delegations','schedules','retries','provider-adapters','tool-processes']}));return;}for await(const chunk of req){} if(req.url==='/chat'){calls++;res.end(JSON.stringify({reply:'Verified fixture response'}));}else if(req.url==='/cancel')res.end(JSON.stringify({stopped:true,residualUsage:false}));else res.end(JSON.stringify({applied:true}));});executor.listen(0,'127.0.0.1');await once(executor,'listening');
 const options={dist:dir,dbPath:join(dir,'runtime.db'),policyPath:join(dir,'policy.json'),executorUrl:`http://127.0.0.1:${executor.address().port}/`,executorToken:'fixture-secret',gateToken:'gate-fixture',port:0};
 let server=createViewerServer(options);await once(server,'listening');
 async function auth(){const base=`http://127.0.0.1:${server.address().port}`;const page=await loopbackFetch(base+'/',{headers:{'Sec-Fetch-Site':'none','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}});const cookie=page.headers.get('set-cookie').split(';')[0];await page.body.cancel();return {base,headers:{Cookie:cookie,Origin:base,'X-Armis-Owner':'1','Content-Type':'application/json'}};}
 try {
  let a=await auth();assert.equal((await checkMacConnection(loopbackFetch,a.base)).working,true);
  const post=()=>fetch(a.base+'/api/chat',{method:'POST',headers:a.headers,body:JSON.stringify({id:'message1',text:'Fixture question'})}).then(r=>r.json());
  const duplicate=await Promise.all([post(),post()]);assert.equal(duplicate[0].reply,'Verified fixture response');assert.equal(duplicate[1].state,'completed');assert.equal(calls,1);
  await new Promise(resolve=>server.close(resolve));server=createViewerServer(options);await once(server,'listening');a=await auth();assert.equal((await post()).state,'completed');assert.equal(calls,1);
  const hq=await(await fetch(a.base+'/api/control/commands',{method:'POST',headers:a.headers,body:JSON.stringify({id:'hq1',type:'company.stop',businessId:'hermes-hq',expectedRevision:0,expiresAt:Date.now()+60000})})).json();assert.equal(hq.state,'effective');
  const reserveChat=await(await fetch(a.base+'/api/chat',{method:'POST',headers:a.headers,body:JSON.stringify({id:'after-hq-stop',text:'Fixture question'})})).json();assert.equal(reserveChat.state,'completed');
  const view=await(await fetch(a.base+'/api/control',{headers:a.headers})).json();assert.equal(view.companies['hermes-hq'].consumedRequests,0);assert.equal(view.ownerReserve.consumedRequests,2);
  const stopped=await(await fetch(a.base+'/api/control/commands',{method:'POST',headers:a.headers,body:JSON.stringify({id:'global1',type:'global.stop',expectedRevision:1,expiresAt:Date.now()+60000})})).json();assert.equal(stopped.state,'effective');
  assert.equal((await fetch(a.base+'/api/admission',{method:'POST',headers:{Authorization:'Bearer gate-fixture','Content-Type':'application/json'},body:JSON.stringify({id:'later',businessId:'hermes-hq',provider:'fixture'})})).status,409);
 }finally{await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>executor.close(resolve));rmSync(dir,{recursive:true});}
});
