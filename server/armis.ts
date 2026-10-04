import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
const TABLES=['identities','tasks','execution_events','outcomes','reviews','artifacts','memories','owner_feedback','learning_examples','evaluations','procedures','sync_sources'];
const id=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(v)&&!/(?:password|secret|token|sk-|AIza|gh[pousr]_)/i.test(v)?v:null;
const metric=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
/** Read-only sanitized cache of actual remote digest/count read-back; no DB auth in viewer. */
export function readArmisStatus(path?:string,now=Date.now()){
 const unavailable={state:'unavailable' as const,gap:'No verified Armis database read-back available'};
 if(!path)return unavailable;
 try{
  const raw=readFileSync(path,'utf8');if(raw.length>65536)return unavailable;
  const v=JSON.parse(raw);
  if(v.state!=='connected'||v.projectRef!=='lbzyeywrvzixiryzeddx'||v.organizationId!=='iamhwxlfdmbjpbbcemfz'||metric(v.observedAt)===null)return unavailable;
  const counts:Record<string,number>={};
  for(const name of TABLES){const n=metric(v.counts?.[name]);if(n!==null)counts[name]=n;}
  let held=false;
  try{const h=JSON.parse(readFileSync(join(dirname(path),'health.json'),'utf8'));held=h.state==='held'&&metric(h.observedAt)!==null&&h.observedAt>=v.observedAt;}catch{/* No health receipt: freshness still applies. */}
  const tasks=(Array.isArray(v.tasks)?v.tasks:[]).slice(0,12).map((t:Record<string,unknown>)=>({id:id(t.id),agent:id(t.agent),parent:id(t.parent),state:['running','idle','completed','held','failed','queued','started','waiting'].includes(String(t.state))?String(t.state):'unknown'})).filter((t:{id:string|null})=>t.id);
  return {state:held||now-v.observedAt>60000||now<v.observedAt?'stale' as const:'connected' as const,projectRef:'lbzyeywrvzixiryzeddx',organizationId:'iamhwxlfdmbjpbbcemfz',observedAt:v.observedAt as number,counts,pending:metric(v.pending),tasks,source:'Armis database verified read-back cache',limitation:'Database sync is asynchronous. Character activity uses immediate local runtime events, not sync heartbeats. Proposed lessons are not verified lessons or model retraining.'};
 }catch{return unavailable;}
}
