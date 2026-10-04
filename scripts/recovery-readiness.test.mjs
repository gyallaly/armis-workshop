import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { checkRecoveryReadiness } from './recovery-readiness.mjs';
const identity={version:2,contract:'measured-read-only-recovery-v1',revision:'a'.repeat(40),branch:'fixture',dirty:true,builtAt:1,sourceHash:'b'.repeat(64),assetHash:'c'.repeat(64),buildHash:'d'.repeat(64)};
const frame=(event,extra={})=>`event: ${event}\nid: epoch:0\ndata: ${JSON.stringify({version:1,epoch:'epoch',cursor:0,...extra})}\n\n`;
async function fixture(option={}){const calls=[];const server=createServer((req,res)=>{calls.push(req.url);if(req.url==='/'){res.setHeader('Set-Cookie',option.cookie??'armis_viewer=privateFixture; HttpOnly; SameSite=Strict; Path=/');return res.end('page');}if(req.headers.origin==='http://invalid.example'){res.writeHead(option.foreign??403);return res.end();}if(!req.headers.cookie){res.writeHead(option.anonymous??401);return res.end();}if(req.url==='/api/control'){res.writeHead(option.control??404);return res.end();}if(req.url==='/api/health'){if(option.timeout)return;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({version:1,state:option.state??'connected',source:'armis-journal',epoch:'epoch',cursor:0,build:{...identity,...option.build}}));}if(req.url==='/api/events'){res.setHeader('Content-Type','text/event-stream');if(option.hang)return;return res.end(option.stream??frame('snapshot',{mode:'live',observations:[]})+frame('heartbeat'));}res.writeHead(404);res.end();});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{return {report:await checkRecoveryReadiness({origin:`http://127.0.0.1:${server.address().port}`,expectedIdentity:identity,timeoutMs:100}),calls};}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
test('explicit read-only profile verifies auth identity and coherent SSE; controls unsupported',async()=>{const {report,calls}=await fixture();assert.equal(report.recoveryReady,true);assert.equal(report.viewerReady,false);assert.equal(report.businessReady,false);assert.equal(report.control.status,'unsupported');assert.ok(!calls.includes('/api/evidence'));assert.ok(!JSON.stringify(report).includes('privateFixture'));assert.ok(report.gateCoverage.every(g=>g.status==='unverified'));});
test('all auth source fingerprint and unsupported-control negatives refuse recovery',async()=>{for(const option of [{anonymous:200},{cookie:'armis_viewer=bad; Path=/'},{foreign:200},{state:'disconnected'},{control:200},{build:{sourceHash:'e'.repeat(64)}},{build:{assetHash:null}},{build:{buildHash:'wrong'}},{timeout:true}])assert.equal((await fixture(option)).report.recoveryReady,false,JSON.stringify(option));});
test('bounded coherent snapshot heartbeat required, not ended or gapped transport',async()=>{for(const stream of ['',frame('heartbeat'),frame('snapshot',{mode:'live',observations:[]})+frame('heartbeat',{cursor:1}),frame('snapshot',{mode:'live',observations:[]})+frame('events',{previousCursor:3,cursor:4,observations:[]}),frame('snapshot',{mode:'live',observations:[]})+frame('heartbeat',{epoch:'other'}),frame('snapshot',{mode:'demo',observations:[]})])assert.equal((await fixture({stream})).report.recoveryReady,false);assert.equal((await fixture({hang:true})).report.recoveryReady,false);});
test('no implicit revision-only recovery profile',async()=>{const report=await checkRecoveryReadiness({origin:'http://127.0.0.1:1',expectedIdentity:{revision:identity.revision}});assert.equal(report.recoveryReady,false);});
test('oversized health is cancelled while streaming instead of consumed in full',async()=>{
 let pulls=0,cancelled=false;const block=new Uint8Array(1024*1024).fill(32);
 const fetcher=async(url,{headers={}}={})=>{
  const path=new URL(url).pathname;
  if(path==='/')return new Response('page',{headers:{'Set-Cookie':'armis_viewer=fixture; HttpOnly; SameSite=Strict; Path=/'}});
  if(headers.Origin==='http://invalid.example')return new Response(null,{status:403});
  if(!headers.Cookie)return new Response(null,{status:401});
  return new Response(new ReadableStream({pull(c){pulls++;if(pulls<=10)c.enqueue(block);else c.close();},cancel(){cancelled=true;}}));
 };
 const report=await checkRecoveryReadiness({origin:'http://127.0.0.1:49123',expectedIdentity:identity,fetcher});
 assert.equal(report.recoveryReady,false);assert.ok(pulls<10,'must reject before fully consuming the oversized body');assert.equal(cancelled,true);
});
test('aggregate coherent SSE frames have a hard work budget',async()=>{
 const stream=frame('snapshot',{mode:'live',observations:[]})+frame('current-work',{currentWork:{state:'unavailable'}}).repeat(1100)+frame('heartbeat');
 assert.equal((await fixture({stream})).report.recoveryReady,false);
});
