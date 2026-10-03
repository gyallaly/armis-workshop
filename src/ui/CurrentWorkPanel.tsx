import {useEffect,useState} from 'react';
import {useUi} from './store';
import type {CurrentWork} from '../../server/current-work';
type Observed=ReturnType<CurrentWork['read']>;
type Missing={state:'unavailable';gap:string};
/** Independently polled native metadata, not a synthetic worker or an Armis assignment. */
export function CurrentWorkPanel(){
 const source=useUi(s=>s.prefs.source);const [data,setData]=useState<Observed|Missing|null>(null),[connection,setConnection]=useState('loading');
 useEffect(()=>{
  setData(null);setConnection('loading');if(source!=='live')return;
  const abort=new AbortController();let stopped=false,pending=false;
  const read=async()=>{if(pending)return;pending=true;try{
   const r=await fetch('/api/current-work',{credentials:'same-origin',signal:abort.signal});if(!r.ok)throw Error();
   const v=await r.json() as Observed|Missing;
   if(!stopped){setData(v);setConnection('connected');}
  }catch{if(!stopped)setConnection('disconnected');}finally{pending=false;}};
  void read();const timer=setInterval(()=>void read(),1000);
  return()=>{stopped=true;clearInterval(timer);abort.abort();};
 },[source]);
 if(source!=='live')return null;
 return <details className="org" open data-testid="current-work">
  <summary>Current Hermes work</summary><div className="org__body">
   <p><strong>Native activity is not independent acceptance of this turn. Separate reviewed delegation receipts appear in Runtime evidence.</strong></p>
   <p>Progress-source connection: {connection}. Connection health is separate from execution health.</p>
   {connection==='disconnected'&&<p className="warn">Progress source disconnected. Previously loaded progress is stale; current execution is unknown.</p>}
   {data?.state==='unavailable'?<p>{data.gap}</p>:data?.state==='connected'?<>
    <p>{data.task.title} · <code>{data.task.id}</code></p>
    <p>Observed execution: {connection==='disconnected'?'unknown':data.task.state}{data.task.stale?' (stale)':''}. Last update: {new Date(data.task.lastUpdate).toLocaleString()}.</p>
    <p>{data.task.basis}</p>
    <p>Responsible agent: Managing Director — Hermes (<code>{data.task.responsibleAgent}</code>). Current step: {data.task.currentStep}.</p>
    <p>Hermes default session · <code>{data.sessionId}</code>. One runtime session; steps below are <strong>not separate workers</strong>.</p>
    <p>Configured model: {data.configuredModel??'unknown'}. Actual model receipt: not observed. Independent acceptance: {data.independentAcceptance}.</p>
    <ol>{data.steps.slice(-12).map(s=><li key={s.id}>{s.step} · {s.state} · {new Date(s.lastUpdate).toLocaleTimeString()}<br/><code>{s.id}</code></li>)}</ol>
    <p>{data.limitation}</p>
   </>:<p>Loading native runtime progress…</p>}
  </div>
 </details>;
}
