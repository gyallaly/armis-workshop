import { expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HermesMetadata } from '../server/hermes';
it('reads only explicit session metadata and tool names; never serializes private arguments/results', () => {
  const dir = mkdtempSync(join(process.env.TMPDIR!, 'hermes-viewer-'));
  const path = join(dir, 'state.db');
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY,profile_name TEXT,started_at REAL,model TEXT); CREATE TABLE messages(id INTEGER PRIMARY KEY,session_id TEXT,role TEXT,timestamp REAL,tool_calls TEXT,tool_call_id TEXT,tool_name TEXT,content TEXT,reasoning TEXT);`);
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('session1','default',1000,'configured-model');
  const insert = db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?)');
  insert.run(10,'session1','assistant',1001,JSON.stringify([{ id: 'call1', function: { name: 'terminal', arguments: 'sk-secretvalue-private-prompt' } }]),null,null,'private prompt','private reasoning');
  insert.run(11,'session1','tool',1002,null,'call1','terminal','customer private raw output',null);
  insert.run(12,'unrelated','assistant',1003,JSON.stringify([{ id:'other',function:{name:'send_email'} }]),null,null,'other private prompt',null);
  const source = new HermesMetadata(path, 'session1');
  try {
    const snapshot = source.read(0,10000,true);
    expect(snapshot.observations.map(e => e.type)).toEqual(['source.connected','attempt.activity','attempt.activity']);
    expect(snapshot.observations[1]).toMatchObject({ source:'hermes-metadata',workerId:'hermes.default',taskId:null,attemptId:null,data:{tool:'terminal',phase:'requested'} });
    expect(snapshot.observations[2]).toMatchObject({taskId:null,attemptId:null,data:{phase:'returned'}});
    const serialized = JSON.stringify(snapshot);
    for(const secret of ['sk-secretvalue','private prompt','private reasoning','raw output','send_email']) expect(serialized).not.toContain(secret);
    expect(snapshot.observations[1]!.data.actualModel).toBeUndefined();
    expect(source.read(snapshot.cursor,500).observations).toEqual([]);
    insert.run(13,'session1','assistant',1004,JSON.stringify([{id:'call2',function:{name:'read_file',arguments:'PRIVATE'}}]),null,null,null,null);
    const update=source.read(snapshot.cursor,500);
    expect(update.observations).toHaveLength(1);
    expect(update.observations[0]!.data.tool).toBe('read_file');
    expect(source.read(0,10000,true).cursor).toBe(update.cursor);
  } finally { source.close(); db.close(); rmSync(dir,{recursive:true,force:true}); }
});
