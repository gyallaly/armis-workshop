import {openSync,closeSync,fstatSync,lstatSync,readFileSync,writeFileSync,renameSync,unlinkSync,fsyncSync,realpathSync,constants} from 'node:fs';
import {isAbsolute,dirname,resolve,relative,basename,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import registry from '../src/core/control-registry.json' with {type:'json'};
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v)&&!/(?:sk-|AIza|gh[pousr]_|secret|password|token|credential)/i.test(v);
const time=v=>Number.isSafeInteger(v)&&v>=0;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fields=['sessionId','actorId','jobId','attemptId','workerId','profileName','source','provenance','evidenceId','enrolledAt','expiresAt','revokedAt'];
/** Local host attestation, NOT session discovery, a runtime acceptance receipt or authority grant.
 * Owner/operator must link real host handles before calling. No arbitrary CLI label confers role.
 * Default profile only; other profile DBs need a separately reviewed read scope.
 */
function validate(value,databasePath){
 if(!exact(value,['version','databasePath','records'])||value.version!==1||!isAbsolute(databasePath)||value.databasePath!==databasePath||!Array.isArray(value.records)||value.records.length>32)throw Error('Invalid bounded enrollment registry');
 const seen=new Set();
 for(const r of value.records){
  if(!exact(r,fields)||!['sessionId','actorId','jobId','attemptId','evidenceId'].every(k=>id(r[k]))||seen.has(r.sessionId)||r.workerId!==null&&!registry.roles.some(w=>w.id===r.workerId)||r.profileName!=='default'||!['cli','oneshot'].includes(r.source)||!['owner-attested','dispatcher','setup-runtime'].includes(r.provenance)||!time(r.enrolledAt)||!time(r.expiresAt)||r.expiresAt<=r.enrolledAt||r.expiresAt-r.enrolledAt>86400000||r.revokedAt!==null&&(!time(r.revokedAt)||r.revokedAt<r.enrolledAt))throw Error('Invalid linked enrollment');
  seen.add(r.sessionId);
 }
 return value;
}
function target(path,root){
 if(!isAbsolute(path)||!isAbsolute(root)||resolve(path)!==path||resolve(root)!==root||realpathSync(root)!==root||dirname(path)!==root||!basename(path).endsWith('.json')||relative(root,path).startsWith('..'))throw Error('Enrollment must be a direct private root child');
 const dir=lstatSync(root);if(!dir.isDirectory()||dir.isSymbolicLink()||dir.uid!==process.getuid?.()||(dir.mode&0o077)!==0)throw Error('Enrollment root must be private and owned');
 return path;
}
/** Reads one private bounded file on every observation. Never opens any referenced journal or DB. */
export function readEnrollment(path,root,databasePath){
 target(path,root);const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const st=fstatSync(fd);if(!st.isFile()||st.uid!==process.getuid?.()||(st.mode&0o077)!==0||st.nlink!==1||st.size>32768)throw Error('Enrollment file must be private and bounded');
  return validate(JSON.parse(readFileSync(fd,'utf8')),databasePath);
 }finally{closeSync(fd);}
}
function mutate(path,root,databasePath,change){
 target(path,root);if(!isAbsolute(databasePath)||resolve(databasePath)!==databasePath)throw Error('Explicit absolute DB path required');
 const lock=path+'.lock',fd=openSync(lock,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);let temp;
 try{
  let value;try{value=readEnrollment(path,root,databasePath);}catch(e){if(e.code!=='ENOENT')throw e;value={version:1,databasePath,records:[]};}
  change(value);validate(value,databasePath);
  const body=JSON.stringify(value);if(Buffer.byteLength(body)>32768)throw Error('Enrollment exceeds bound');
  temp=join(root,'.'+basename(path)+'.'+randomUUID());const out=openSync(temp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(out,body);fsyncSync(out);}finally{closeSync(out);}
  renameSync(temp,path);temp=undefined;const dir=openSync(root,constants.O_RDONLY);try{fsyncSync(dir);}finally{closeSync(dir);}
  return readEnrollment(path,root,databasePath);
 }finally{if(temp)unlinkSync(temp);closeSync(fd);unlinkSync(lock);}
}
/** Idempotent same-record enrollment; conflicts and revoked IDs cannot silently re-enroll. */
export function enrollSession(path,root,databasePath,record){
 validate({version:1,databasePath,records:[record]},databasePath);
 if(record.revokedAt!==null)throw Error('New enrollment cannot be revoked');
 return mutate(path,root,databasePath,value=>{
  const old=value.records.find(r=>r.sessionId===record.sessionId);
  if(old){if(fields.some(k=>old[k]!==record[k]))throw Error('Enrollment identity conflict');return;}
  value.records.push({...record});
 });
}
export function revokeSession(path,root,databasePath,sessionId,at){
 if(!id(sessionId)||!time(at))throw Error('Invalid revocation');
 return mutate(path,root,databasePath,value=>{const r=value.records.find(r=>r.sessionId===sessionId);if(!r||at<r.enrolledAt)throw Error('Unknown enrollment or invalid revocation clock');if(r.revokedAt===null)r.revokedAt=at;});
}
