import {test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {CurrentWork} from '../server/current-work';
import {currentWorkEvents} from '../src/adapters/current-work';
import {initialState,reduce} from '../src/core/reducer';
import {ROSTER} from '../src/core/config';
import {JournalProjection} from '../src/adapters/journal';

function fixture(){
 const dir=mkdtempSync(process.env.TMPDIR+'/visibility-'),path=dir+'/state.db',db=new DatabaseSync(path);
 db.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY,source TEXT,chat_id TEXT,thread_id TEXT,profile_name TEXT,started_at REAL,ended_at REAL,end_reason TEXT,model TEXT,last_activity_at REAL,last_activity_provenance TEXT,title TEXT);
 CREATE TABLE messages(id INTEGER PRIMARY KEY,session_id TEXT,role TEXT,timestamp REAL,finish_reason TEXT,tool_calls TEXT,tool_call_id TEXT,tool_name TEXT,content TEXT,active INTEGER DEFAULT 1,reasoning TEXT);`);
 const session=(id:string,source='cli',profile='default')=>db.prepare('INSERT INTO sessions VALUES(?,?,NULL,NULL,?,1,NULL,NULL,?,2,?,?)').run(id,source,profile,'configured-model','unknown','PRIVATE title');
 const message=(id:number,sid:string,role:string,time:number,finish:string|null=null,calls:string|null=null,callId:string|null=null,content='PRIVATE content')=>db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,NULL,?,1,?)').run(id,sid,role,time,finish,calls,callId,content,'PRIVATE reasoning');
 const request=(id:number,sid:string,callId:string)=>message(id,sid,'assistant',2,'tool_calls',JSON.stringify([{id:callId,function:{name:'terminal',arguments:'PRIVATE args'}}]));
 return {path,db,session,message,request,close(){db.close();rmSync(dir,{recursive:true});}};
}

test('five allowlisted sessions retain distinct identities, only explicit roles enter city, completion never becomes acceptance',()=>{
 const f=fixture();let reader:CurrentWork|undefined;
 try{
  const roles=ROSTER.filter(w=>w.businessId==='hermes-hq').map(w=>w.id);
  const ids=['island','visibility','chat','resources','policy'];
  ids.forEach((id,i)=>{f.session(id,i===0?'oneshot':'cli');f.message(i*10+1,id,'user',1);f.request(i*10+2,id,'call-'+i);});
  f.session('private-unlisted');f.message(100,'private-unlisted','user',9);
  const scope={sessionIds:ids,bindings:ids.map((sessionId,i)=>({sessionId,workerId:roles[i]!}))};
  reader=new CurrentWork(f.path,scope);scope.sessionIds.push('private-unlisted');
  const value=reader.read(2500);expect('sessions' in value).toBe(true);if(!('sessions' in value))throw Error('wrong frame');
  expect(value.sessionCount).toBe(5);expect(value.boundRoleCount).toBe(5);
  expect(JSON.stringify(value)).not.toMatch(/PRIVATE|private-unlisted|args|reasoning/);
  const events=currentWorkEvents(value);expect(events).toHaveLength(20);
  let city=reduce(initialState(ROSTER,'connected',2500),{kind:'events',events});
  expect(Object.values(city.statuses).filter(s=>s.state==='active')).toHaveLength(5);
  f.message(200,'island','tool',3,null,null,'call-0','{"exit_code":0}');f.message(201,'island','assistant',4,'stop');
  f.db.prepare('UPDATE sessions SET ended_at=4,end_reason=? WHERE id=?').run('normal','island');
  const completed=reader.read(4500);if(!('sessions' in completed))throw Error('wrong frame');
  expect(completed.sessions[0]).toMatchObject({lifecycle:'ended',task:{state:'completed'},independentAcceptance:'not observed'});
  city=reduce(city,{kind:'events',events:currentWorkEvents(completed)});
  expect(city.statuses[roles[0]!]!.state).toBe('idle');expect(city.tasks['island:turn:1']!.status).toBe('held');
  expect(currentWorkEvents(completed).some(e=>e.type==='task.ready'||e.type==='attempt.finished')).toBe(false);
  const stale=reader.read(200000);city=reduce(city,{kind:'events',events:currentWorkEvents(stale)});
  expect(Object.values(city.statuses).filter(s=>s.state==='active')).toHaveLength(0);
  expect(city.statuses[roles[1]!]!.state).toBe('unknown');
  const journal=new JournalProjection();const snapshot=journal.decode('snapshot',JSON.stringify({version:1,epoch:'visibility',cursor:0,mode:'live',observations:[],currentWork:completed}),4500);
  expect(snapshot.type).toBe('snapshot');
  const update=journal.decode('current-work',JSON.stringify({version:1,epoch:'visibility',cursor:0,currentWork:stale}),200000);
  expect(update.type).toBe('events');expect(()=>journal.decode('current-work',JSON.stringify({version:1,epoch:'visibility',cursor:1,currentWork:stale}),200000)).toThrow();
 }finally{reader?.close();f.close();}
});

test('unbound, missing, wrong-profile and wrong-source sessions cannot impersonate roles; closure without final response stays unknown',()=>{
 const f=fixture();let reader:CurrentWork|undefined;
 try{
  f.session('allowed');f.message(1,'allowed','user',1);f.request(2,'allowed','call');
  f.session('other-profile','cli','private');f.session('other-source','slack');
  reader=new CurrentWork(f.path,{sessionIds:['allowed','missing','other-profile','other-source']});
  let value=reader.read(2500);if(!('sessions' in value))throw Error('wrong frame');
  expect(value.sessionCount).toBe(1);expect(value.boundRoleCount).toBe(0);expect(currentWorkEvents(value)).toEqual([]);
  f.db.prepare('UPDATE sessions SET ended_at=3 WHERE id=?').run('allowed');
  value=reader.read(3500);if(!('sessions' in value))throw Error('wrong frame');
  expect(value.sessions[0]).toMatchObject({lifecycle:'ended',task:{state:'unknown'}});
  expect(()=>new CurrentWork(f.path,{sessionIds:[]})).toThrow();
  expect(()=>new CurrentWork(f.path,{sessionIds:['allowed','allowed']})).toThrow();
  expect(()=>new CurrentWork(f.path,{sessionIds:['allowed'],bindings:[{sessionId:'private',workerId:'armis.ceo'}]})).toThrow();
  expect(()=>reader!.read(-1)).toThrow();
 }finally{reader?.close();f.close();}
});

test('role occupancy prefers running session and missing binding clears stale activity, with invalid payloads rejected atomically',()=>{
 const record=(id:string,state:string,at=1900)=>({state:'connected',sessionId:id,workerId:'armis.ceo',observedAt:2000,task:{id:id+':turn:1',state,lastUpdate:at,responsibleAgent:'armis.ceo'},steps:[]});
 const frame={version:2,state:'connected',observedAt:2000,sessions:[record('active','running',1800),record('done','completed')]};
 const events=currentWorkEvents(frame);expect(events).toHaveLength(4);expect(events.at(-1)?.sessionId).toBe('active');
 expect(()=>currentWorkEvents({...frame,sessions:[record('a','running'),record('a','completed')]})).toThrow();
 expect(()=>currentWorkEvents({...frame,sessions:[{...record('a','running'),workerId:'fake.role'}]})).toThrow();
 const gone=currentWorkEvents({...frame,sessions:[{state:'unavailable',sessionId:'active',workerId:'armis.ceo'}]});expect(gone).toHaveLength(1);expect(gone[0]?.payload.state).toBe('unknown');
 const waiting=currentWorkEvents({...frame,sessions:[record('a','waiting')]});expect(waiting.at(-1)?.payload.state).toBe('unknown');expect(waiting.some(e=>e.payload.status==='waiting_approval')).toBe(false);
});
