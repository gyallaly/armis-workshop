import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,symlinkSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {enrollSession,revokeSession,readEnrollment} from './session-enrollment.mjs';
const record={sessionId:'native-tui',actorId:'owner-connor',jobId:'completion',attemptId:'attempt-1',workerId:null,profileName:'default',source:'cli',provenance:'owner-attested',evidenceId:'attestation-1',enrolledAt:1000,expiresAt:10000,revokedAt:null};
function fixture(){const root=mkdtempSync(process.env.TMPDIR+'/enroll-script-');return {root,path:join(root,'sessions.json'),databasePath:join(root,'state.db'),close(){rmSync(root,{recursive:true});}};}
test('trusted atomic enrollment survives reads, conflicts and irrevocable revocation',()=>{
 const f=fixture();try{
  enrollSession(f.path,f.root,f.databasePath,record);enrollSession(f.path,f.root,f.databasePath,record);
  assert.equal(readEnrollment(f.path,f.root,f.databasePath).records.length,1);
  const before=readFileSync(f.path,'utf8');assert.throws(()=>enrollSession(f.path,f.root,f.databasePath,{...record,workerId:'armis.ceo'}));assert.equal(readFileSync(f.path,'utf8'),before);
  revokeSession(f.path,f.root,f.databasePath,record.sessionId,2000);assert.equal(readEnrollment(f.path,f.root,f.databasePath).records[0].revokedAt,2000);
  assert.throws(()=>enrollSession(f.path,f.root,f.databasePath,record));assert.throws(()=>readEnrollment(f.path,f.root,join(f.root,'wrong.db')));
 }finally{f.close();}
});
test('reject unsafe paths, authority labels, private fields, permissions and excessive windows',()=>{
 const f=fixture();try{
  for(const change of [{provenance:'cli-director'},{privatePrompt:'PRIVATE'},{actorId:''},{expiresAt:1000+86400001},{workerId:'invented.role'}])assert.throws(()=>enrollSession(f.path,f.root,f.databasePath,{...record,...change}));
  assert.throws(()=>enrollSession(join(f.root,'..','escape.json'),f.root,f.databasePath,record));
  enrollSession(f.path,f.root,f.databasePath,record);symlinkSync(f.path,join(f.root,'link.json'));assert.throws(()=>readEnrollment(join(f.root,'link.json'),f.root,f.databasePath));
  chmodSync(f.path,0o644);assert.throws(()=>readEnrollment(f.path,f.root,f.databasePath));
 }finally{f.close();}
});
