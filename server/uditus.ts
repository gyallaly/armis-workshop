import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

interface Binding {url:string;key:string}
interface SourceStatus {state:'connected'|'unavailable';count:number|null;gap?:string}
const QUERIES:Record<string,{table:string;query:string;count:boolean}>={
 prospects:{table:'leads',query:'select=id&limit=1',count:true},
 scans:{table:'scans',query:'select=id&limit=1',count:true},
 qualification:{table:'leads',query:'select=id&fit_category=not.is.null&limit=1',count:true},
 reports:{table:'artifacts',query:'select=id&kind=in.(miniscan_pdf,audit_pdf)&limit=1',count:true},
 drafts:{table:'messages',query:'select=id&direction=eq.outbound&sent_at=is.null&discarded_at=is.null&limit=1',count:true},
 approvals:{table:'batch_approvals',query:'select=id&limit=1',count:true},
 workshopTasks:{table:'workshop_tasks',query:'select=id,state,stage,depends_on,repair_round,updated_at&order=created_at.desc&limit=30',count:true},
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
 return new UditusSource({url:env.NEXT_PUBLIC_SUPABASE_URL,key:env.SUPABASE_SERVICE_ROLE_KEY});
}
export class UditusSource {
 private binding:Binding;private request:typeof fetch;
 private cached:Awaited<ReturnType<UditusSource['collect']>>|undefined;
 private pending:Promise<Awaited<ReturnType<UditusSource['collect']>>>|undefined;
 constructor(binding:Binding,request:typeof fetch=fetch) {
  const u=new URL(binding.url);
  if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Explicit Supabase HTTPS project binding required');
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
     sources[name]={state:'unavailable',count:null,gap:`public.${q.table} unavailable (${code})${name.startsWith('workshop')?'; apply migration 030 after 029':''}`};return;
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
  return {observedAt:Date.now(),projectRef:new URL(this.binding.url).hostname.split('.')[0],sources,
   senderHealth:{state:sources.senderHealth?.state==='unavailable'?'unavailable':!records.length?'unknown':fresh?'observed':'stale',records},
   killSwitch:typeof rows.operationsControl?.[0]?.kill_switch==='boolean'?rows.operationsControl[0].kill_switch:null,
   tasks:(rows.workshopTasks??[]).map(r=>({id:id(r.id),state:states.has(String(r.state))?String(r.state):'unknown',stage:stages.has(String(r.stage))?String(r.stage):'unknown',dependsOn:id(r.depends_on),repairRound:typeof r.repair_round==='number'&&Number.isSafeInteger(r.repair_round)?r.repair_round:null,updatedAt:date(r.updated_at)})).filter(r=>r.id),
   attempts:(rows.workshopAttempts??[]).map(r=>({id:id(r.id),taskId:id(r.task_id),stage:stages.has(String(r.stage))?String(r.stage):'unknown',configuredModel:id(r.model),startedAt:date(r.started_at),finishedAt:date(r.finished_at)})).filter(r=>r.id&&r.taskId),
   controls:'Read-only; producer execution and all outbound actions disabled'};
 }
}
