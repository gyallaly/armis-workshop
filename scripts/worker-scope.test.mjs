import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {createViewerServer} from '../server/index.ts';
import {loopbackFetch} from './loopback-fetch.mjs';
import {enrollSession,revokeSession} from './session-enrollment.mjs';

for(const durable of [false,true])test(`${durable?'durable enrollment':'explicit worker scope'} reaches authenticated current-work API without private text`,async()=>{
 const dir=mkdtempSync(join(tmpdir(),'worker-scope-'));
 chmodSync(dir,0o700);
 writeFileSync(join(dir,'index.html'),'<html>fixture</html>');
 const dbPath=join(dir,'sessions.db'),db=new DatabaseSync(dbPath);
 db.exec(`CREATE TABLE sessions(id TEXT,source TEXT,profile_name TEXT,started_at REAL,ended_at REAL,model TEXT,last_activity_at REAL,last_activity_provenance TEXT);
 CREATE TABLE messages(id INTEGER,session_id TEXT,role TEXT,active INTEGER,timestamp REAL,tool_calls TEXT,tool_call_id TEXT,content TEXT,finish_reason TEXT);`);
 const now=Date.now()/1000;
 db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)').run('worker-fixture','oneshot','default',now,null,'fixture-model',now,'agent.tool');
 db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?)').run(1,'worker-fixture','user',1,now,null,null,'PRIVATE OWNER TEXT',null);
 db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?)').run(2,'worker-fixture','assistant',1,now,JSON.stringify([{id:'call-fixture',function:{name:'read_file',arguments:'PRIVATE ARGUMENTS'}}]),null,null,null);
 db.close();
 const scopePath=join(dir,'scope.json');writeFileSync(scopePath,JSON.stringify({sessionIds:['worker-fixture'],bindings:[]}));
 const enrolledPath=join(dir,'enrollment.json');
 if(durable)enrollSession(enrolledPath,dir,dbPath,{sessionId:'worker-fixture',actorId:'development-owner',jobId:'scoped-development',attemptId:'test-attempt',workerId:null,profileName:'default',source:'oneshot',provenance:'owner-attested',evidenceId:'test-attestation',enrolledAt:Date.now(),expiresAt:Date.now()+60000,revokedAt:null});
 const binding=durable?{currentWorkEnrollmentPath:enrolledPath,currentWorkEnrollmentRoot:dir}:{currentWorkScopePath:scopePath};
 const server=createViewerServer({dist:dir,policyPath:join(dir,'policy.json'),chatStorePath:join(dir,'chat.json'),currentWorkDbPath:dbPath,...binding,port:0});
 await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(base+'/api/current-work')).status,401);
  const page=await loopbackFetch(base+'/',{headers:{'Sec-Fetch-Site':'none','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}});
  const cookie=page.headers.get('set-cookie').split(';')[0];await page.body.cancel();
  const response=await fetch(base+'/api/current-work',{headers:{Cookie:cookie}}),text=await response.text(),value=JSON.parse(text);
  assert.equal(value.version,2);assert.equal(value.sessionCount,1);assert.equal(value.boundRoleCount,0);
  assert.equal(value.sessions[0].sessionId,'worker-fixture');assert.equal(value.sessions[0].task.state,'running');
  assert.ok(!text.includes('PRIVATE'));assert.equal(value.independentAcceptance,'not observed');
  if(durable){
   assert.equal(value.sessions[0].enrollment.status,'current');
   revokeSession(enrolledPath,dir,dbPath,'worker-fixture',Date.now());
   const revoked=await(await fetch(base+'/api/current-work',{headers:{Cookie:cookie}})).json();
   assert.equal(revoked.sessionCount,0);assert.equal(revoked.sessions[0].state,'unavailable');assert.equal(revoked.sessions[0].enrollment.status,'revoked');
  }
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true});}
});
