import { buildIdentity, loopbackOrigin, GATE_PATHS } from './city-v2-readiness.mjs';
import { loopbackFetch } from './loopback-fetch.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export const RECOVERY_CONTRACT='measured-read-only-recovery-v1';
export const IDENTITY_KEYS=['version','contract','revision','branch','dirty','builtAt','sourceHash','assetHash','buildHash'];
export function recoveryIdentity(root){const id=buildIdentity(root);const manifest=JSON.parse(readFileSync(join(root,'dist/build-info.json'),'utf8'));if(manifest.contract!==RECOVERY_CONTRACT)throw Error('Explicit measured recovery contract required');return {...id,contract:manifest.contract};}
export function validateRecoveryIdentity(id){if(id?.version!==2||id.contract!==RECOVERY_CONTRACT||!/^[a-f0-9]{40}$/.test(id.revision)||typeof id.branch!=='string'||typeof id.dirty!=='boolean'||!Number.isSafeInteger(id.builtAt)||id.builtAt<0||['sourceHash','assetHash','buildHash'].some(k=>!/^[a-f0-9]{64}$/.test(id[k])))throw Error('Measured recovery identity required');}
async function boundedText(response,maxBytes) {
 if(!response.body)throw Error('Response body missing');
 const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,chunks=0,text='';
 try {while(true){const part=await reader.read();if(part.done)return text+decoder.decode();if(++chunks>4096||part.value.byteLength>maxBytes-bytes)throw Error('Response exceeds streaming bound');bytes+=part.value.byteLength;text+=decoder.decode(part.value,{stream:true});}}
 finally {await reader.cancel();}
}
export async function checkRecoveryReadiness({origin,expectedIdentity,fetcher=loopbackFetch,timeoutMs=10000}={}) {
 const result={version:1,profile:RECOVERY_CONTRACT,checkedAt:Date.now(),origin:null,recoveryReady:false,transportReady:false,viewerReady:false,businessReady:false,control:{status:'unverified',route:'/api/control'},gateCoverage:GATE_PATHS.map(path=>({path,status:'unverified'})),build:null,gaps:[]};
 try {
  validateRecoveryIdentity(expectedIdentity);const base=loopbackOrigin(origin);result.origin=base;
  const signal=AbortSignal.timeout(timeoutMs),get=(path,headers={})=>fetcher(base+path,{headers,signal});
  const status=async(path,headers)=>{const r=await get(path,headers);await r.body?.cancel();return r.status;};
  if(await status('/api/health')!==401)throw Error('Anonymous auth failed');
  const page=await get('/',{'Sec-Fetch-Site':'none','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}),cookie=page.headers.get('set-cookie');await page.body?.cancel();
  if(page.status!==200||!/^armis_viewer=[A-Za-z0-9]+;/.test(cookie??'')||!cookie.includes('HttpOnly')||!cookie.includes('SameSite=Strict')||!cookie.includes('Path=/'))throw Error('Unsafe navigation cookie');
  const headers={Cookie:cookie.split(';')[0],Origin:base};
  if(await status('/api/health',{...headers,Origin:'http://invalid.example'})!==403)throw Error('Foreign origin accepted');
  const health=await get('/api/health',headers);if(health.status!==200)throw Error('Health unavailable');const text=await boundedText(health,2*1024*1024);const h=JSON.parse(text);
  if(h.version!==1||h.state!=='connected'||!['armis-journal','hermes-metadata'].includes(h.source)||typeof h.epoch!=='string'||!h.epoch||!Number.isSafeInteger(h.cursor)||h.cursor<0)throw Error('Connected source missing');
  if(IDENTITY_KEYS.some(k=>h.build?.[k]!==expectedIdentity[k]))throw Error('Exact recovery identity mismatch');result.build={...expectedIdentity};
  if(await status('/api/control',headers)!==404)throw Error('Recovery controls must be absent');result.control.status='unsupported';
  const response=await get('/api/events',headers);if(response.status!==200||!response.headers.get('content-type')?.includes('text/event-stream')||!response.body)throw Error('SSE unavailable');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',epoch=null,cursor=null,heartbeat=false,bytes=0,frames=0;
  try {while(!heartbeat){const part=await reader.read();if(part.done)throw Error('SSE ended');if(part.value.byteLength>16*1024*1024-bytes)throw Error('SSE aggregate byte limit');bytes+=part.value.byteLength;buffer+=decoder.decode(part.value,{stream:true}).replaceAll('\r\n','\n');if(buffer.length>16*1024*1024)throw Error('Frame exceeds bound');let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const f=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const kind=f.split('\n').find(l=>l.startsWith('event:'))?.slice(6).trim(),id=f.split('\n').find(l=>l.startsWith('id:'))?.slice(3).trim(),lines=f.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart());if(!lines.length)continue;if(++frames>1024)throw Error('SSE aggregate frame limit');const v=JSON.parse(lines.join('\n'));if(v.version!==1||typeof v.epoch!=='string'||!Number.isSafeInteger(v.cursor)||v.cursor<0||id!==`${v.epoch}:${v.cursor}`)throw Error('Invalid SSE envelope');if(kind==='snapshot'){if(epoch!==null||v.epoch!==h.epoch||v.cursor<h.cursor||v.mode!=='live'||!Array.isArray(v.observations))throw Error('Invalid snapshot');epoch=v.epoch;cursor=v.cursor;}else{if(epoch===null||v.epoch!==epoch)throw Error('Missing snapshot or epoch gap');if(kind==='events'){if(v.previousCursor!==cursor||v.cursor<=cursor||!Array.isArray(v.observations))throw Error('Cursor gap');cursor=v.cursor;}else if(kind==='heartbeat'){if(v.cursor!==cursor)throw Error('Heartbeat gap');heartbeat=true;}else if(kind==='current-work'){if(v.cursor!==cursor||!v.currentWork||typeof v.currentWork!=='object')throw Error('Current work gap');}else throw Error('Unexpected frame');}}}}finally{await reader.cancel();}
  result.recoveryReady=true;result.transportReady=true;
 }catch{result.gaps.push('Measured recovery authentication/source/identity/absent-control/bounded SSE verification failed.');}
 result.gaps.push('Recovery is read-only; current viewer, chat, installed execution gates and business acceptance remain unverified. No evidence/provider endpoint queried.');return result;
}
