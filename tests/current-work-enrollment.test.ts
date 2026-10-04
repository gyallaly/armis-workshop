import {test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,writeFileSync,chmodSync} from 'node:fs';
import {CurrentWork} from '../server/current-work';
import {currentWorkEvents} from '../src/adapters/current-work';

function fixture(){
 const root=mkdtempSync(process.env.TMPDIR+'/enrollment-'),path=root+'/state.db',registry=root+'/enrollment.json',db=new DatabaseSync(path);
 db.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY,source TEXT,profile_name TEXT,started_at REAL,ended_at REAL,model TEXT,last_activity_at REAL,last_activity_provenance TEXT);
 CREATE TABLE messages(id INTEGER PRIMARY KEY,session_id TEXT,role TEXT,timestamp REAL,finish_reason TEXT,tool_calls TEXT,tool_call_id TEXT,content TEXT,active INTEGER DEFAULT 1);`);
 for(const [i,id] of ['native-tui','private-session','native-worker'].entries()){
  db.prepare('INSERT INTO sessions VALUES(?,?,?,1,NULL,?,2,?)').run(id,'cli','default','configured-model','unknown');
  db.prepare('INSERT INTO messages VALUES(?,?,?,?,NULL,NULL,NULL,?,1)').run(i+1,id,'user',1,'PRIVATE prompt');
 }
 const record={sessionId:'native-tui',actorId:'owner-connor',jobId:'owner-workshop-completion',attemptId:'owner-attempt-1',workerId:null,profileName:'default',source:'cli',provenance:'owner-attested',evidenceId:'owner-attestation-1',enrolledAt:1000,expiresAt:10000,revokedAt:null};
 const save=(records:any[])=>{writeFileSync(registry,JSON.stringify({version:1,databasePath:path,records}),{mode:0o600});chmodSync(registry,0o600);};
 return {root,path,registry,db,record,save,scope:{enrollmentPath:registry,enrollmentRoot:root},close(){db.close();rmSync(root,{recursive:true});}};
}
test('durable enrollment is reloaded, bounded, private, revocable and never infers a role',()=>{
 const f=fixture();let reader:CurrentWork|undefined;
 try{
  f.save([f.record]);reader=new CurrentWork(f.path,f.scope);let v=reader.read(2500);if(!('sessions' in v))throw Error('wrong frame');
  expect(v.sessions).toHaveLength(1);expect(v.sessions[0]).toMatchObject({sessionId:'native-tui',workerId:null,enrollment:{status:'current',actorId:'owner-connor',jobId:'owner-workshop-completion',attemptId:'owner-attempt-1'}});
  expect(JSON.stringify(v)).not.toMatch(/PRIVATE|private-session|native-worker|databasePath/);expect(currentWorkEvents(v)).toEqual([]);
  reader.close();reader=new CurrentWork(f.path,f.scope);expect(reader.read(2500)).toEqual(v);
  const worker={...f.record,sessionId:'native-worker',workerId:'armis.ceo',provenance:'dispatcher',actorId:'dispatcher-host',jobId:'dispatch-job',attemptId:'dispatch-attempt',evidenceId:'dispatch-step'};
  f.save([f.record,worker]);v=reader.read(2500);expect('sessions' in v&&v.sessions).toHaveLength(2);expect(currentWorkEvents(v)).toHaveLength(4);
  f.save([f.record,{...worker,revokedAt:2600}]);v=reader.read(2700);if(!('sessions' in v))throw Error('wrong frame');
  expect(v.sessions[1]).toMatchObject({state:'unavailable',enrollment:{status:'revoked'}});expect(currentWorkEvents(v).at(-1)?.payload.state).toBe('unknown');
  v=reader.read(10000);if(!('sessions' in v))throw Error('wrong frame');expect(v.sessions[0]).toMatchObject({state:'unavailable',enrollment:{status:'expired'}});
 }finally{reader?.close();f.close();}
});
test('invalid registry fails closed before exposing any native work',()=>{
 const f=fixture();let reader:CurrentWork|undefined;
 try{
  f.save([f.record]);reader=new CurrentWork(f.path,f.scope);
  for(const records of [[{...f.record,actorId:null}],[f.record,f.record],[{...f.record,provenance:'cli says director'}],[{...f.record,expiresAt:999999999}],[{...f.record,prompt:'PRIVATE'}]]){
   f.save(records);expect(()=>reader!.read(2500)).toThrow();
  }
  f.save([f.record]);chmodSync(f.registry,0o644);expect(()=>reader!.read(2500)).toThrow();
 }finally{reader?.close();f.close();}
});
