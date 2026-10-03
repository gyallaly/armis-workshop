import {useEffect,useState} from 'react';
import {displayStatus} from '../core/selectors';
import {useWorkshop,useUi} from './store';
import type {SetupEvidence} from '../../server/evidence';
import type {readArmisStatus} from '../../server/armis';
import type {UditusSource} from '../../server/uditus';

type Setup=ReturnType<SetupEvidence['read']>;
type Business=Awaited<ReturnType<UditusSource['read']>>;
type Missing={state:'unavailable';gap:string};
interface Evidence {build:{revision:string;branch:string}|null;setup:Setup|Missing;uditus:Business|Missing;armis?:ReturnType<typeof readArmisStatus>}
/** Read-only supplemental evidence. It cannot start/retry a task or alter controls. */
export function RuntimePanel(){
 const state=useWorkshop(s=>s),source=useUi(s=>s.prefs.source);
 const [data,setData]=useState<Evidence|null>(null),[connection,setConnection]=useState('loading');
 useEffect(()=>{
  setData(null);setConnection('loading');if(source!=='live')return;
  let stopped=false;const abort=new AbortController();
  const read=async()=>{try{
   const response=await fetch('/api/evidence',{credentials:'same-origin',signal:abort.signal});
   if(!response.ok)throw Error('Disconnected');
   const value=await response.json() as Evidence;
   if(!value||!value.setup||!value.uditus)throw Error('Unsupported evidence');
   if(!stopped){setData(value);setConnection('connected');}
  }catch{if(!stopped)setConnection('disconnected');}};
  void read();const timer=setInterval(()=>void read(),5000);
  return()=>{stopped=true;clearInterval(timer);abort.abort();};
 },[source]);
 if(source!=='live')return null;
 const installed=Object.values(state.workers).filter(w=>w.installation?.installed===true);
 return <details className="org" data-testid="runtime-evidence">
  <summary>Runtime evidence</summary>
  <div className="org__body">
   <p>Read-only evidence: {connection}. No task controls, customer sending, or business execution.</p>
   {connection==='disconnected'&&<p className="warn">Source disconnected. Previously loaded evidence is stale; no current state inferred.</p>}
   {data?.build&&<p>Installed build: <code>{data.build.branch}</code> · <code>{data.build.revision}</code></p>}
   <h3>Installed runtime roles</h3>
   <p>{installed.length} installed role bindings · journal {state.connection}. Installation is not active inference.</p>
   <ul>{installed.map(w=>{const d=displayStatus(state,w);return <li key={w.id}><strong>{w.name}</strong> · <code>{w.id}</code> · installed · {d.state}{d.stale?' (stale)':''} · {w.installation?.source}</li>;})}</ul>
   <h3>Operations → worker → independent review</h3>
   {data?.setup.state==='unavailable'?<p>{data.setup.gap}</p>:data?.setup.state==='connected'?<>
    <p>Durable setup journal. Results are internal only and are not released. A finished call is not independent acceptance.</p>
    <p>Execution health: {data.setup.executionHealth.state} · {data.setup.executionHealth.running} running · {data.setup.executionHealth.held} held · {data.setup.executionHealth.completed} completed.</p>
    {data.setup.workflows.map(w=><details key={w.id}><summary><code>{w.id}</code> · {w.state} · review {w.reviewPassed===null?'not observed':w.reviewPassed?'passed':'failed'}</summary>
     <pre style={{whiteSpace:'pre-wrap'}}>{w.result}</pre>
     <p>Independent review issues: {w.reviewIssueCount??'unknown'} · External release: disabled</p>
     {w.diagnosticGap&&<p className="warn">{w.diagnosticGap}</p>}
     <ol>{data.setup.state==='connected'&&data.setup.calls.filter(c=>c.workflowId===w.id).sort((a,b)=>(a.startedAt??0)-(b.startedAt??0)).map(c=><li key={c.id}>{c.phase} · <code>{c.roleId}</code> · {c.state}<br/>Requested: {c.requestedModel??'unknown'}<br/>Observed: {c.actualProvider??'unknown'} / {c.actualModel??'unknown'} · tokens {c.inputTokens??'unknown'} in / {c.outputTokens??'unknown'} out<br/>{c.failure&&<span>Failure: {c.failure.reason} · HTTP {c.failure.observedHttpStatus??'unknown'} · finish {c.failure.finishReason??'unknown'} · {c.failure.failureCategory??'category unknown'}<br/></span>}<code>{c.id}</code></li>)}</ol>
    </details>)}
   </>:<p>Loading setup evidence…</p>}
   <h3>Armis durable operational database</h3>
   {data?.armis&&'counts' in data.armis?<>
    <p>{data.armis.state} · project <code>{data.armis.projectRef}</code>. Last verified database read-back: {new Date(data.armis.observedAt).toLocaleString()}.</p>
    {data.armis.state==='stale'&&<p className="warn">Sync evidence is stale or held. Local runtime events remain independent; no remote freshness inferred.</p>}
    <p>Pending synchronization: {data.armis.pending??'unknown'}.</p>
    <ul>{Object.entries(data.armis.counts).map(([kind,count])=><li key={kind}>{kind}: {count} actual records</li>)}</ul>
    <ul>{data.armis.tasks.map((t:{id:string;agent:string|null;parent:string|null;state:string})=><li key={t.id}><code>{t.id}</code> · {t.agent??'agent unknown'} · {t.state}{t.parent?<> · parent <code>{t.parent}</code></>:null}</li>)}</ul>
    <p>{data.armis.limitation}</p>
   </>:<p>{data?.armis?.state==='unavailable'?data.armis.gap:'No Armis database read-back bound'}</p>}
   <h3>Uditus read-only business sources</h3>
   {data?.uditus&&'sources' in data.uditus?<>
    <p>Verified configured project: <code>{data.uditus.projectRef}</code>. Observed {new Date(data.uditus.observedAt).toLocaleString()}. Reads refresh every 30 seconds.</p>
    <ul>{Object.entries(data.uditus.sources).map(([name,s])=><li key={name}><strong>{name}</strong>: {s.state}{s.count!==null?` · ${s.count} recorded rows`:''}{s.gap?` · ${s.gap}`:''}</li>)}</ul>
    <p>Sender health: {data.uditus.senderHealth.state}{!data.uditus.senderHealth.records.length?' — no health record; not healthy by assumption':''}. Operations kill switch: {data.uditus.killSwitch===null?'unknown':data.uditus.killSwitch?'engaged':'not engaged'}.</p>
    {data.uditus.senderHealth.records.map((r,i)=><p key={i}>{r.status} · {r.observedAt??'timestamp unknown'}</p>)}
    {data.uditus.tasks.map(t=><details key={t.id}><summary><code>{t.id}</code> · {t.state} · {t.stage}</summary><p>Dependency: {t.dependsOn??'none recorded'} · Repair round: {t.repairRound??'unknown'} · Updated: {t.updatedAt??'unknown'}</p></details>)}
    <p>Existing producer: Uditus workshop enqueue/claim/finish RPCs. This viewer reads existing task/attempt rows only; it never invokes those RPCs. No rows are invented if the tables are absent.</p>
   </>:<p>{data?.uditus&&'gap' in data.uditus?data.uditus.gap:'Loading business sources…'}</p>}
  </div>
 </details>;
}
