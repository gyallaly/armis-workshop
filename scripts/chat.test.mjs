import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,statSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DurableChat,HermesCliChat} from '../server/chat.ts';
import {OwnerPolicy,EXECUTION_PATHS} from '../server/owner-policy.mjs';
const fixture=()=>{
 const dir=mkdtempSync(join(tmpdir(),'armis-chat-'));let calls=0,releases=0;
 const policy={path:join(dir,'policy.json'),state:{globalStopped:false},coverage:async()=>({verified:true,chat:true}),reserve:()=>{calls++;},release:()=>{releases++;}};
 return {dir,policy,path:join(dir,'chat.json'),counts:()=>({calls,releases}),cleanup:()=>rmSync(dir,{recursive:true,force:true})};
};
test('durable concurrent dedupe, conflict, resume, private receipts and reconnect',async()=>{
 const f=fixture();let executions=0;const seen=[];
 const transport={run:async(req,sid,onSession)=>{executions++;seen.push(sid);onSession('session-fixture');return {reply:'fixture reply',sessionId:'session-fixture',tokens:4};}};
 let chat=new DurableChat(f.policy,transport,f.path);
 try{
  const request={id:'one',text:'fixture'};const replies=await Promise.all([chat.send(request),chat.send(request)]);
  assert.equal(replies[0].state,'completed');assert.equal(replies[1].reply,'fixture reply');assert.equal(executions,1);
  await assert.rejects(chat.send({id:'one',text:'different'}),/conflict/);
  assert.equal(statSync(f.path).mode&0o777,0o600);
  assert.ok(!readFileSync(f.path,'utf8').includes('"text":"fixture"'));
  await chat.close();chat=new DurableChat(f.policy,transport,f.path);
  assert.equal((await chat.send(request)).state,'completed');assert.equal(executions,1);
  await chat.send({id:'two',text:'next'});assert.deepEqual(seen,[undefined,'session-fixture']);
 }finally{await chat.close();f.cleanup();}
});
test('missing execution coverage and global fence never execute',async()=>{
 const f=fixture();let executions=0;f.policy.coverage=async()=>({verified:false,chat:true});
 const chat=new DurableChat(f.policy,{run:async()=>{executions++;return {reply:'must not run'};}},f.path);
 try{assert.equal((await chat.send({id:'held',text:'fixture'})).state,'held');f.policy.coverage=async()=>({verified:true,chat:true});f.policy.state.globalStopped=true;assert.equal((await chat.send({id:'stop',text:'fixture'})).state,'held');assert.equal(executions,0);assert.equal(f.counts().calls,0);}finally{await chat.close();f.cleanup();}
});
test('cancel keeps unknown usage/reservation and original ID cannot be replayed',async()=>{
 const f=fixture();let started;const ready=new Promise(r=>started=r);let executions=0;
 const chat=new DurableChat(f.policy,{run:async(req,sid,onSession,signal)=>{executions++;onSession('cancel-fixture');started();return new Promise((r,j)=>signal.addEventListener('abort',()=>j(Error('interrupted')),{once:true}));}},f.path);
 try{const pending=chat.send({id:'cancel',text:'fixture'});await ready;assert.equal(chat.cancel('cancel').state,'cancel_requested');assert.equal((await pending).state,'unknown');assert.equal(chat.get('cancel').residualUsage,'unknown');assert.equal((await chat.send({id:'cancel',text:'fixture'})).state,'unknown');assert.equal((await chat.send({id:'next',text:'fixture'})).state,'held');assert.equal(executions,1);assert.equal(f.counts().releases,0);}finally{await chat.close();f.cleanup();}
});
test('restart makes running receipt unknown without dispatch, retains session',async()=>{
 const f=fixture();writeFileSync(f.path,JSON.stringify({version:1,messages:{old:{fingerprint:'fixture',result:{id:'old',conversationId:'owner',state:'running',sessionId:'old-session'}}},sessions:{owner:'old-session'}}),{mode:0o600});
 const chat=new DurableChat(f.policy,{run:async()=>{throw Error('must not dispatch');}},f.path);
 try{assert.equal(chat.get('old').state,'unknown');assert.equal(chat.get('old').sessionId,'old-session');assert.equal((await chat.send({id:'new',text:'fixture'})).state,'held');assert.equal(f.counts().calls,0);}finally{await chat.close();f.cleanup();}
});
test('single writer and restrictive storage fail closed',async()=>{
 const f=fixture();const chat=new DurableChat(f.policy,null,f.path);
 try{assert.throws(()=>new DurableChat(f.policy,null,f.path),/already owned/);}finally{await chat.close();}
 chmodSync(f.path,0o644);assert.throws(()=>new DurableChat(f.policy,null,f.path),/private regular/);f.cleanup();
});
test('supported CLI fixture uses stdin, default profile, explicit resume and no policy bypass flags',async()=>{
 const f=fixture();const executable=join(f.dir,'hermes-fixture');const argsPath=join(f.dir,'args.json');
 writeFileSync(executable,`#!/usr/bin/env node\nimport{writeFileSync}from'node:fs';\nwriteFileSync(${JSON.stringify(argsPath)},JSON.stringify(process.argv.slice(2)));\nlet input='';for await(const c of process.stdin)input+=c;\nconsole.log(JSON.stringify({type:'system',subtype:'init',session_id:'cli-fixture'}));\nconsole.log(JSON.stringify({type:'tool_use',input:{secret:'not retained'}}));\nconsole.log(JSON.stringify({type:'result',session_id:'cli-fixture',exit_code:0,text:input,tokens:{total:8}}));\n`,{mode:0o700});
 try{const cli=new HermesCliChat(executable,f.dir);const sessions=[];const receipt=await cli.run({id:'cli',text:'$(not-a-shell) ☃'},'previous-fixture',id=>sessions.push(id),new AbortController().signal);
 assert.equal(receipt.reply,'$(not-a-shell) ☃');assert.equal(receipt.tokens,8);assert.deepEqual(sessions,['cli-fixture','cli-fixture']);
 const args=JSON.parse(readFileSync(argsPath,'utf8'));assert.deepEqual(args,['--profile','default','chat','--query-file','-','--format','stream-json','--in',f.dir,'--resume','previous-fixture']);
 }finally{f.cleanup();}
});
test('CLI interruption terminates fixture process and rejects fabricated completion',async()=>{
 const f=fixture();const executable=join(f.dir,'hermes-fixture');writeFileSync(executable,`#!/usr/bin/env node\nconsole.log(JSON.stringify({type:'system',subtype:'init',session_id:'interrupt-fixture'}));setInterval(()=>{},1000);\n`,{mode:0o700});
 try{const cli=new HermesCliChat(executable,f.dir,100);await assert.rejects(cli.run({id:'cli',text:'fixture'},undefined,()=>{},new AbortController().signal),/unknown/);}finally{f.cleanup();}
});
test('real policy records measured chat tokens and explicitly unknown money',async()=>{
 const f=fixture();const p=new OwnerPolicy(f.policy.path,{capabilities:async()=>({verified:true,covered:EXECUTION_PATHS,chat:true})},()=>({verified:true,covered:EXECUTION_PATHS}));
 const chat=new DurableChat(p,{run:async()=>({reply:'fixture',tokens:9})},f.path);
 try{assert.equal((await chat.send({id:'measured',text:'fixture'})).state,'completed');assert.equal(p.state.ownerReserve.consumedTokens,9);assert.equal(p.state.ownerReserve.consumedRequests,1);assert.equal(p.state.ownerReserve.unknownRequests,true);assert.equal(p.state.completedReservations['chat:measured'].costMicros,null);assert.equal(p.state.ownerReserve.unknownCost,true);}finally{await chat.close();f.cleanup();}
});
test('blanket capability advertisement cannot enable production chat without installed verifier',async()=>{
 const f=fixture();let runs=0;const p=new OwnerPolicy(f.policy.path,{capabilities:async()=>({verified:true,covered:EXECUTION_PATHS,chat:true})});
 const chat=new DurableChat(p,{run:async()=>{runs++;return {reply:'must not run'};}},f.path);
 try{assert.equal((await chat.send({id:'no-proof',text:'fixture'})).state,'held');assert.equal(runs,0);assert.equal(p.state.reservations.length,0);}finally{await chat.close();f.cleanup();}
});
test('CLI malformed measured tokens are rejected rather than silently dropped',async()=>{
 const f=fixture();const executable=join(f.dir,'hermes-fixture');writeFileSync(executable,`#!/usr/bin/env node\nfor await(const c of process.stdin){}\nconsole.log(JSON.stringify({type:'result',session_id:'bad-token',exit_code:0,text:'fixture',tokens:{total:-1}}));\n`,{mode:0o700});
 try{await assert.rejects(new HermesCliChat(executable,f.dir).run({id:'bad-token',text:'fixture'},undefined,()=>{},new AbortController().signal),/unknown/);}finally{f.cleanup();}
});
test('finite token, request and spend ceilings hold unbounded transports before run',async()=>{
 for(const key of ['tokenLimit','requestLimit','spendLimitMicros']){
  const f=fixture();let runs=0;f.policy.state.ownerReserve={[key]:100};const chat=new DurableChat(f.policy,{run:async()=>{runs++;return {reply:'bad'};}},f.path);
  try{assert.equal((await chat.send({id:'finite',text:'fixture'})).state,'held');assert.equal(runs,0);assert.equal(f.counts().calls,0);}finally{await chat.close();f.cleanup();}
 }
});
test('transport enforced bounds reserve truthfully and invalid or exceeding usage retains hold',async()=>{
 for(const tokens of [-1,NaN,1.5,Number.MAX_SAFE_INTEGER+1,11]){
  const f=fixture();f.policy.state.ownerReserve={tokenLimit:100};let reserved,release;
  f.policy.reserve=value=>{reserved=value;};f.policy.release=(id,usage)=>{release=usage;};
  const chat=new DurableChat(f.policy,{admission:async()=>({enforced:true,provider:'fixture',tokens:10,requests:1,costMicros:null}),run:async()=>({reply:'fixture',tokens})},f.path);
  try{assert.equal((await chat.send({id:'bad-usage',text:'fixture'})).state,'unknown');assert.equal(reserved.tokens,10);assert.equal(reserved.costMicros,null);assert.equal(release,undefined);}finally{await chat.close();f.cleanup();}
 }
});
