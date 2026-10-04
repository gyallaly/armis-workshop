import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { checkReadiness, ACCEPTANCE, GATE_PATHS, FEED_IDS, summarizeFeeds, treeHash, savePrivate, isolatedPlaywrightConfig, loopbackOrigin } from './city-v2-readiness.mjs';
import { renderSwitch, validateReceipt, switchViewer, rollbackViewer, liveAdapter } from './city-v2-deploy.mjs';
import { EXECUTION_PATHS } from '../server/owner-policy.mjs';
import { RECOVERY_CONTRACT } from './recovery-readiness.mjs';
const revision='a'.repeat(40);
const recovery={version:2,contract:RECOVERY_CONTRACT,revision,branch:'fixture',dirty:false,builtAt:1,sourceHash:'a'.repeat(64),assetHash:'b'.repeat(64),buildHash:'c'.repeat(64)};
const scratch=()=>mkdtempSync(join(process.env.TMPDIR,'city-v2-readiness-test-'));
const frame=(name,data)=>`event: ${name}\ndata: ${JSON.stringify({version:1,epoch:'fixture',cursor:0,...data})}\n\n`;
async function fixture(options={}) {
  const calls=[];
  const server=createServer((req,res)=>{
    calls.push({method:req.method,path:req.url});
    if(req.headers.origin==='http://invalid.example'){res.writeHead(403);return res.end();}
    if(req.url==='/'){
      assert.equal(req.headers['sec-fetch-mode'],'navigate');assert.equal(req.headers['sec-fetch-dest'],'document');
      res.setHeader('Set-Cookie','armis_viewer=fixtureSecret; HttpOnly; SameSite=Strict; Path=/');return res.end('fixture');
    }
    if(req.headers.cookie!=='armis_viewer=fixtureSecret'){res.writeHead(401);return res.end();}
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/health')return res.end(JSON.stringify({version:1,state:'connected',source:'armis-journal',build:{revision:options.revision??revision,sourceHash:options.sourceHash??'a'.repeat(64),buildHash:options.buildHash??'b'.repeat(64)}}));
    if(req.url==='/api/control')return res.end(JSON.stringify({version:2,capabilities:{chat:options.chat??false,companyControl:options.companyControl??false,allocations:options.allocations??false},coverage:{verified:false,uncovered:GATE_PATHS}}));
    if(req.url==='/api/evidence')return res.end(JSON.stringify({reports:options.reports??[]}));
    if(req.url==='/api/events'){
      res.setHeader('Content-Type','text/event-stream');
      return res.end(options.stream??frame('snapshot',{mode:'live',observations:[]})+frame('current-work',{currentWork:{state:'unavailable'}})+frame('heartbeat',{}));
    }
    res.writeHead(404);res.end();
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{return {report:await checkReadiness({origin:`http://127.0.0.1:${server.address().port}`,expectedRevision:revision,expectedSourceHash:'a'.repeat(64),expectedBuildHash:'b'.repeat(64)}),calls};}
  finally {await new Promise(r=>server.close(r));}
}
test('exact acceptance inventory shares all 10 policy paths and 23 source categories',()=>{
  assert.equal(ACCEPTANCE.length,11);assert.equal(new Set(ACCEPTANCE.map(a=>a[0])).size,11);assert.equal(GATE_PATHS.length,10);assert.strictEqual(GATE_PATHS,EXECUTION_PATHS);assert.equal(FEED_IDS.length,23);assert.equal(new Set(FEED_IDS).size,23);
});
test('same revision with wrong or malformed served fingerprints fails closed',async()=>{
  for(const options of [{sourceHash:'c'.repeat(64)},{buildHash:'c'.repeat(64)},{sourceHash:''},{buildHash:'bad'}])assert.equal((await fixture(options)).report.viewerReady,false);
});
test('deployment health passes exact expected candidate and recovery hashes',async()=>{
 const server=createServer((req,res)=>{
   if(req.url==='/'){res.setHeader('Set-Cookie','armis_viewer=fixture; HttpOnly; SameSite=Strict; Path=/');return res.end();}
   if(req.headers.origin==='http://invalid.example'){res.writeHead(403);return res.end();}
   if(!req.headers.cookie){res.writeHead(401);return res.end();}
   res.end(JSON.stringify({version:1,state:'connected',source:'armis-journal',build:{revision,sourceHash:'c'.repeat(64),buildHash:'d'.repeat(64)}}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const plan={origin:`http://127.0.0.1:${server.address().port}`,identity:{revision,sourceHash:'a'.repeat(64),buildHash:'b'.repeat(64)},recoveryIdentity:recovery,recoveryOrigin:`http://127.0.0.1:${server.address().port}`};
   await assert.rejects(liveAdapter.health(plan),/readiness/);await assert.rejects(liveAdapter.health(plan,true),/readiness/);
 }finally{await new Promise(r=>server.close(r));}
});
test('real loopback handshake checks auth, same origin, snapshot/current-work/heartbeat without exposing cookie',async()=>{
  const {report,calls}=await fixture();assert.equal(report.viewerReady,true);assert.equal(report.businessReady,false);assert.equal(report.uditusSending,'paused');assert.equal(report.sources.length,23);assert.ok(calls.every(c=>c.method==='GET'));assert.ok(!JSON.stringify(report).includes('fixtureSecret'));assert.ok(report.gateCoverage.every(g=>g.status==='unverified'));
});
test('chat-only advertised capability is distinct from global controls and unexercised',async()=>{
  const {report}=await fixture({chat:true});assert.equal(report.viewerReady,true);assert.equal(report.chatReadiness.status,'advertised-unexercised');assert.equal(report.chatReadiness.executionTested,false);assert.equal(report.capabilities.companyControl,false);assert.equal(report.businessReady,false);
});
test('global company and allocation controls require independent acceptance',async()=>{
  for(const option of [{companyControl:true},{allocations:true}])assert.equal((await fixture(option)).report.viewerReady,false);
});
test('served revision mismatch fails without claiming transport readiness',async()=>{
  const {report}=await fixture({revision:'b'.repeat(40)});assert.equal(report.viewerReady,false);
});
test('heartbeat without snapshot and incoherent cursor fail',async()=>{
  for(const stream of [frame('heartbeat',{}),frame('snapshot',{mode:'live',observations:[]})+frame('heartbeat',{cursor:1}),frame('snapshot',{mode:'live',observations:[]})+frame('events',{previousCursor:1,cursor:2,observations:[]})])assert.equal((await fixture({stream})).report.viewerReady,false);
});
test('source freshness and missing feeds remain explicit; duplicates are invalid',()=>{
  const feeds=summarizeFeeds([{id:'runtime',status:'ok',checkedAt:1,records:0}],50000);assert.equal(feeds[0].status,'stale');assert.equal(feeds[1].status,'unobserved');assert.throws(()=>summarizeFeeds([{id:'runtime',status:'ok',checkedAt:1,records:0},{id:'runtime',status:'ok',checkedAt:1,records:0}]),/inventory/);
});
test('origin rejects remote hosts, credentials, paths, fragments and query tokens',()=>{
  for(const origin of ['http://localhost:4173','https://127.0.0.1:4173','http://secret@127.0.0.1:4173','http://127.0.0.1:4173/x','http://127.0.0.1:4173/#secret','http://127.0.0.1:4173/?token=secret'])assert.throws(()=>loopbackOrigin(origin));
});
test('source hashes include untracked candidate code but not credential files or dist',()=>{
  const dir=scratch();try{mkdirSync(join(dir,'server'));writeFileSync(join(dir,'server/a.ts'),'one');const first=treeHash(dir);writeFileSync(join(dir,'.env'),'never read');assert.equal(treeHash(dir),first);writeFileSync(join(dir,'server/a.ts'),'two');assert.notEqual(treeHash(dir),first);symlinkSync(join(dir,'.env'),join(dir,'server/link'));assert.throws(()=>treeHash(dir),/symbolic/);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('private reports are exclusive and mode 600',()=>{
  const dir=scratch();try{const path=join(dir,'report.json');savePrivate(path,{passed:false});assert.equal(statSync(path).mode&0o777,0o600);assert.throws(()=>savePrivate(path,{}));assert.equal(JSON.parse(readFileSync(path)).passed,false);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('isolated e2e config uses strict candidate port and no operational server reuse',()=>{
  const text=isolatedPlaywrightConfig('/candidate','/outside-git',49123);assert.match(text,/reuseExistingServer:false/);assert.match(text,/49123/);assert.match(text,/--strictPort/);assert.match(text,/\/candidate\/dist/);assert.match(text,/\/candidate\/e2e/);assert.ok(!text.includes('4173'));assert.throws(()=>isolatedPlaywrightConfig('/candidate','/scratch',4173));
});
const identity={revision,sourceHash:'s'.repeat(64),buildHash:'b'.repeat(64)};
function receipt(){return {version:2,passed:true,buildGeneratedByVerifier:true,checkedAt:1000,...identity,tests:['typecheck','domain','runtime-and-readiness','build','e2e'].map(name=>({name,status:'passed',...(name==='e2e'?{candidateOrigin:'http://127.0.0.1:49123'}:{})}))};}
test('activation receipt binds every suite, exact source/build and isolated e2e',()=>{
  validateReceipt(receipt(),identity,1001);
  for(const change of [{passed:false},{sourceHash:'changed'},{buildHash:'changed'},{checkedAt:2000},{buildGeneratedByVerifier:false}])assert.throws(()=>validateReceipt({...receipt(),...change},identity,1001));
  const wrong=receipt();wrong.tests.at(-1).candidateOrigin='http://127.0.0.1:4173';assert.throws(()=>validateReceipt(wrong,identity,1001));
});
test('switch is narrowly scoped and preserves absolute existing policy storage',()=>{
  const text=renderSwitch({root:'/candidate',node:'/installed/node',policyPath:'/previous/.armis/owner-policy.json'});assert.match(text,/WorkingDirectory=\/candidate/);assert.match(text,/\/previous\/\.armis\/owner-policy.json/);assert.ok(!text.includes('TOKEN'));assert.throws(()=>renderSwitch({root:'/bad%path',node:'/node',policyPath:'/policy'}));
});
function transaction({fail=false,restoreFail=false,existing=false,baselineFail=false}={}){
  const calls=[];let installed=existing;
  const plan={content:'candidate',identity,ownPrevious:existing?{content:'candidate'}:null,recoveryRoot:'/measured-recovery',recoveryContent:'measured-recovery',recoveryOrigin:'http://127.0.0.1:49124',recoveryIdentity:recovery};
  const adapter={capture:()=>calls.push('capture'),install:()=>{calls.push('install');installed=true;},restart:()=>calls.push('restart'),active:()=>installed,restore:()=>{calls.push('restore');if(restoreFail)throw Error('failure');installed=false;},restored:()=>!installed,health:async(_p,previous)=>{calls.push(previous?'previous-health':'candidate-health');if(previous&&baselineFail||!previous&&fail)throw Error('failure');return previous?{recoveryReady:true}:{viewerReady:true};}};
  adapter.identity=()=>({...identity});adapter.recoveryIdentity=()=>({...recovery});adapter.recoveryConfig=()=>plan.recoveryContent;return {plan,adapter,calls};
}
test('actual source, build or stamp mutation during checkpoint refuses activation',async()=>{
  for(const file of ['server/a.ts','dist/index.html','dist/build-info.json']){
    const root=scratch();try{
      mkdirSync(join(root,'server'));mkdirSync(join(root,'dist'));writeFileSync(join(root,'server/a.ts'),'original');writeFileSync(join(root,'dist/index.html'),'original');
      writeFileSync(join(root,'dist/build-info.json'),JSON.stringify({version:2,revision,branch:'fixture',dirty:true,builtAt:1,sourceHash:treeHash(root),assetHash:treeHash(root,'assets')}));
      const {buildIdentity}=await import('./city-v2-readiness.mjs');const t=transaction();t.plan.root=root;t.plan.identity=buildIdentity(root);delete t.adapter.identity;
      await assert.rejects(switchViewer(t.plan,{adapter:t.adapter,checkpoint:()=>writeFileSync(join(root,file),file.endsWith('.json')?JSON.stringify({revision:'c'.repeat(40),branch:'fixture',dirty:true,builtAt:1}):'changed')}),/identity|changed/);
      assert.ok(!t.calls.includes('install'));assert.ok(!t.calls.includes('restart'));
    }finally{rmSync(root,{recursive:true,force:true});}
  }
});
test('activation checkpoints before mutation and verifies installed binding/health',async()=>{
  const t=transaction();const report=await switchViewer(t.plan,{adapter:t.adapter,checkpoint:()=>t.calls.push('checkpoint')});assert.equal(report.state,'activated');assert.equal(report.businessReady,false);assert.deepEqual(t.calls,['capture','previous-health','checkpoint','install','restart','candidate-health']);
});
test('repeat activation is idempotent and does not restart or checkpoint',async()=>{
  const t=transaction({existing:true});const report=await switchViewer(t.plan,{adapter:t.adapter,checkpoint:()=>assert.fail()});assert.equal(report.state,'already-active');assert.deepEqual(t.calls,['capture','candidate-health']);
});
test('failed candidate health rolls back and checks restored health',async()=>{
  const t=transaction({fail:true});const report=await switchViewer(t.plan,{adapter:t.adapter});assert.equal(report.state,'rolled-back');assert.equal(report.rollbackVerified,true);assert.deepEqual(t.calls.slice(-3),['restore','restart','previous-health']);
});
test('failed rollback remains unknown and is not replayed',async()=>{
  const t=transaction({fail:true,restoreFail:true});const report=await switchViewer(t.plan,{adapter:t.adapter});assert.equal(report.state,'rollback-unverified');assert.equal(report.changed,null);assert.equal(report.rollbackVerified,false);assert.equal(t.calls.filter(c=>c==='restore').length,1);
});
test('unhealthy baseline never writes or restarts',async()=>{
  const t=transaction({baselineFail:true});await assert.rejects(switchViewer(t.plan,{adapter:t.adapter}));assert.deepEqual(t.calls,['capture','previous-health']);
});
test('explicit rollback verifies restored binding and health',async()=>{
  const t=transaction({existing:true});const report=await rollbackViewer(t.plan,{adapter:t.adapter});assert.equal(report.rollbackVerified,true);assert.deepEqual(t.calls,['restore','restart','previous-health']);
});
