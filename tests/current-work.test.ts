import {test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {CurrentWork} from '../server/current-work';

test('ordinary work follows only the authorized thread and keeps tool steps separate from workers',()=>{
 const dir=mkdtempSync(process.env.TMPDIR+'/ordinary-work-'),path=dir+'/source.db';const db=new DatabaseSync(path);
 db.exec(`CREATE TABLE sessions(id TEXT,source TEXT,chat_id TEXT,thread_id TEXT,profile_name TEXT,started_at REAL,ended_at REAL,model TEXT,last_activity_at REAL,last_activity_provenance TEXT);
 CREATE TABLE messages(id INTEGER PRIMARY KEY,session_id TEXT,role TEXT,timestamp REAL,finish_reason TEXT,tool_calls TEXT,tool_call_id TEXT,tool_name TEXT,content TEXT,active INTEGER DEFAULT 1);`);
 db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?)').run('actual-session','slack','authorized-chat','authorized-thread','default',1,null,'configured-model',2,'unknown');
 db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?)').run('unrelated-session','slack','other-chat','other-thread','default',9,null,'private-model',9,'unknown');
 db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,1)').run(1,'actual-session','user',1,null,null,null,null,'PRIVATE user request');
 db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,1)').run(2,'actual-session','assistant',2,'tool_calls',JSON.stringify([{id:'call-one',function:{name:'terminal',arguments:'password=PRIVATE'}}]),null,null,'PRIVATE reasoning');
 const reader=new CurrentWork(path,{chatId:'authorized-chat',threadId:'authorized-thread'});
 const read=(now:number)=>{const result=reader.read(now);if('sessions' in result)throw Error('Unexpected multi-session response');return result;};
 try{const r=read(2500);expect(r).toMatchObject({state:'connected',sessionId:'actual-session',task:{id:'actual-session:turn:1',state:'running'},workerCount:1,independentAcceptance:'not observed'});expect(r.steps).toHaveLength(1);expect(r.steps[0]).toMatchObject({id:'call-one',step:'Run a command',state:'running'});expect(JSON.stringify(r)).not.toMatch(/PRIVATE|password|private-model|unrelated-session/);
 db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,1)').run(3,'actual-session','tool',3,null,null,'call-one','terminal',JSON.stringify({exit_code:1,error:'PRIVATE output'}));
 const afterFailure=read(3500);expect(afterFailure.steps[0]?.state).toBe('failed');expect(afterFailure.task.state).toBe('failed');
 db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,1)').run(4,'actual-session','assistant',4,'stop',null,null,null,'PRIVATE final answer');
 const completed=read(4500);expect(completed.task.state).toBe('completed');expect(completed.independentAcceptance).toBe('not observed');
 expect(read(200000).task.state).toBe('completed');
 db.prepare('UPDATE sessions SET last_activity_at=?,last_activity_provenance=? WHERE id=?').run(5,'agent.compression_turnhold','actual-session');
 expect(read(5500).task.state).toBe('waiting');expect(read(200000).task.state).toBe('unknown');
 db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?)').run('fresh-session','slack','authorized-chat','authorized-thread','default',10,null,'next-model',10,'unknown');
 db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,1)').run(5,'fresh-session','user',10,null,null,null,null,'PRIVATE next request');
 expect(read(10500).sessionId).toBe('fresh-session');expect(read(10500).steps).toEqual([]);
 }finally{reader.close();db.close();rmSync(dir,{recursive:true});}
});
