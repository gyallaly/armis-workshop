import {test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';

// Opt-in, metadata-only installed check; never enumerate session rows or private text.
test.skipIf(process.env.ARMIS_VISIBILITY_INVENTORY!=='1')('inventory installed SessionDB read-only and verify the owner-authorized CLI session',()=>{
 const path='/home/connor/.hermes/state.db';expect(existsSync(path)).toBe(true);
 const db=new DatabaseSync(path,{readOnly:true});
 try{
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  const sessions=db.prepare('PRAGMA table_info(sessions)').all().map(r=>r.name);
  const messages=db.prepare('PRAGMA table_info(messages)').all().map(r=>r.name);
  console.log('Visibility schema inventory',JSON.stringify({tables:tables.map(r=>r.name),sessions,messages}));
  const row=db.prepare('SELECT id,source,profile_name,ended_at,last_activity_provenance FROM sessions WHERE id=?').get('20261003_192208_b0e017');
  console.log('Authorized visibility binding',JSON.stringify(row));
  expect(row).toMatchObject({id:'20261003_192208_b0e017',source:'oneshot',profile_name:'default'});
 }finally{db.close();}
});
