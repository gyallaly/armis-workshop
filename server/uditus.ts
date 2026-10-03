import { readFileSync } from 'node:fs';
import {dirname,resolve} from 'node:path';
import { parseEnv } from 'node:util';

interface Binding {url:string;key:string}
interface SourceStatus {state:'connected'|'unavailable'|'missing_access'|'not_configured'|'unsupported';count:number|null;gap?:string}
const QUERIES:Record<string,{table:string;query:string;count:boolean}>={
 prospects:{table:'leads',query:'select=id&limit=1',count:true},
 scans:{table:'scans',query:'select=id&limit=1',count:true},
 qualification:{table:'leads',query:'select=id&fit_category=not.is.null&limit=1',count:true},
 reports:{table:'artifacts',query:'select=id&kind=in.(miniscan_pdf,audit_pdf)&limit=1',count:true},
 drafts:{table:'messages',query:'select=id&direction=eq.outbound&sent_at=is.null&discarded_at=is.null&limit=1',count:true},
 approvals:{table:'batch_approvals',query:'select=id&limit=1',count:true},
 workshopTasks:{table:'workshop_tasks',query:'select=id,state,stage,depends_on,repair_round,updated_at,lease_until&order=created_at.desc&limit=30',count:true},
 agentJobs:{table:'agent_jobs',query:'select=id,state,kind,lease_until&order=created_at.desc&limit=30',count:true},
 workshopAttempts:{table:'workshop_attempts',query:'select=id,task_id,stage,model,started_at,finished_at&order=started_at.desc&limit=100',count:true},
 senderHealth:{table:'sender_health',query:'select=status,observed_at&limit=10',count:false},
 operationsControl:{table:'operations_control',query:'select=kill_switch&limit=1',count:false},
};
const states=new Set(['queued','running','ready','held','cancelled']);
const stages=new Set(['create','review','repair']);
const id=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(v)&&!/(?:sk-|AIza|gh[pousr]_|password|secret|token)/i.test(v)?v:null;
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
/** Uses only the project's existing explicit .env binding; no account/project discovery. */
export function bindUditus(path:string):UditusSource {
 const env=parseEnv(readFileSync(path,'utf8'));
 if(!env.NEXT_PUBLIC_SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Missing Uditus environment');
 return new UditusSource({url:env.NEXT_PUBLIC_SUPABASE_URL,key:env.SUPABASE_SERVICE_ROLE_KEY},fetch,readUditusConfiguration(path));
}
export class UditusSource {
 private binding:Binding;private request:typeof fetch;
 private cached:Awaited<ReturnType<UditusSource['collect']>>|undefined;
 private pending:Promise<Awaited<ReturnType<UditusSource['collect']>>>|undefined;
 readonly configuration:ReturnType<typeof readUditusConfiguration>|undefined;
 constructor(binding:Binding,request:typeof fetch=fetch,configuration?:ReturnType<typeof readUditusConfiguration>) {
  this.configuration=configuration;
  const u=new URL(binding.url);
  if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Explicit Supabase HTTPS project binding required');
  if(u.hostname!=='sgfgoezfazrweaycdlkq.supabase.co')throw Error('Unexpected Uditus project binding');
  this.binding={url:u.origin,key:binding.key};this.request=request;
 }
 async read() {
  if(this.cached&&Date.now()-this.cached.observedAt<30000)return this.cached;
  if(!this.pending)this.pending=this.collect().then(v=>{this.cached=v;return v;}).finally(()=>{this.pending=undefined;});
  return this.pending;
 }
 private async collect() {
  const sources:Record<string,SourceStatus>={},rows:Record<string,Record<string,unknown>[]>={};
  await Promise.all(Object.entries(QUERIES).map(async([name,q])=>{
   try {
    const response=await this.request(`${this.binding.url}/rest/v1/${q.table}?${q.query}`,{method:'GET',redirect:'error',headers:{apikey:this.binding.key,Authorization:`Bearer ${this.binding.key}`,...(q.count?{Prefer:'count=exact'}:{})},signal:AbortSignal.timeout(10000)});
    if(!response.ok){
     const raw=await response.json() as Record<string,unknown>,code=typeof raw.code==='string'&&/^[A-Z0-9]{1,16}$/.test(raw.code)?raw.code:`HTTP${response.status}`;
     sources[name]={state:response.status===401||response.status===403?'missing_access':response.status===404?'not_configured':'unsupported',count:null,gap:`public.${q.table} unavailable (${code}); source not verified`};return;
    }
    const body=await response.json() as unknown;
    if(!Array.isArray(body)||body.length>100||body.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw Error('Unsupported response');
    const range=response.headers.get('content-range'),match=range?.match(/\/(\d+)$/),count=match?Number(match[1]):null;
    if(q.count&&(count===null||!Number.isSafeInteger(count)||count<0))throw Error('Exact count unavailable');
    sources[name]={state:'connected',count};rows[name]=body as Record<string,unknown>[];
   }catch {sources[name]={state:'unavailable',count:null,gap:`public.${q.table}: read failed or unsupported response; no state inferred`};}
  }));
  const records=(rows.senderHealth??[]).map(r=>({status:['unknown','healthy','degraded','blocked'].includes(String(r.status))?String(r.status):'unknown',observedAt:date(r.observed_at)}));
  const fresh=records.every(r=>r.observedAt&&Date.now()-Date.parse(r.observedAt)>=0&&Date.now()-Date.parse(r.observedAt)<900000);
  return {observedAt:Date.now(),projectRef:new URL(this.binding.url).hostname.split('.')[0],sources,configuration:this.configuration,
   senderHealth:{state:sources.senderHealth?.state!=='connected'?'unavailable':!records.length?'unknown':fresh?'observed':'stale',records},
   killSwitch:typeof rows.operationsControl?.[0]?.kill_switch==='boolean'?rows.operationsControl[0].kill_switch:null,
   tasks:(rows.workshopTasks??[]).map(r=>({id:id(r.id),state:states.has(String(r.state))?String(r.state):'unknown',stage:stages.has(String(r.stage))?String(r.stage):'unknown',dependsOn:id(r.depends_on),repairRound:typeof r.repair_round==='number'&&Number.isSafeInteger(r.repair_round)?r.repair_round:null,updatedAt:date(r.updated_at),leaseUntil:date(r.lease_until)})).filter(r=>r.id),
   agentJobs:(rows.agentJobs??[]).map(r=>({state:['queued','running','succeeded','failed','held','cancelled'].includes(String(r.state))?String(r.state):'unknown',kind:['discover','scan-pending','qualify','report','draft','followup'].includes(String(r.kind))?String(r.kind):'unknown',leaseUntil:date(r.lease_until)})),
   attempts:(rows.workshopAttempts??[]).map(r=>({id:id(r.id),taskId:id(r.task_id),stage:stages.has(String(r.stage))?String(r.stage):'unknown',configuredModel:id(r.model),startedAt:date(r.started_at),finishedAt:date(r.finished_at)})).filter(r=>r.id&&r.taskId),
   controls:'Read-only; producer execution and all outbound actions disabled'};
 }
}

/** Configured entries and copied verification dates are never provider receipts. */
function readUditusConfiguration(path:string){
 const env=parseEnv(readFileSync(path,'utf8'));
 let models:{provider:string;model:string;configuredVerifiedAt:string|null}[]=[],modelRegistryState='not_configured';
 try{
  const raw=readFileSync(resolve(dirname(path),env.UDITUS_WORKSHOP_MODELS||'workshop.models.json'),'utf8');
  if(raw.length>65536)throw Error('Unsupported registry');
  const values=JSON.parse(raw);if(!Array.isArray(values)||values.length>30)throw Error('Unsupported registry');
  models=values.map(v=>({provider:v?.provider,model:id(v?.model),configuredVerifiedAt:date(v?.verifiedAt)})).filter((v):v is {provider:string;model:string;configuredVerifiedAt:string|null}=>['gemini','openai-codex'].includes(v.provider)&&v.model!==null);
  modelRegistryState=models.length===values.length?'configured':'unsupported';
 }catch(e){modelRegistryState=(e as NodeJS.ErrnoException).code==='EACCES'?'missing_access':(e as NodeJS.ErrnoException).code==='ENOENT'?'not_configured':'unsupported';}
 return {environmentKillSwitch:env.UDITUS_KILL_SWITCH!=='false',outboundDisabled:env.UDITUS_OUTBOUND_ENABLED==='false',models,modelRegistryState};
}
