import {DatabaseSync} from 'node:sqlite';
import {readFileSync, accessSync, constants} from 'node:fs';
import {FEEDS, type FeedId, type FeedReport} from '../src/core/connections.ts';

type Status = FeedReport['status'];
const metric=(v:unknown):number|null=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
const sourceFailure=(e:unknown)=>({state:(e as NodeJS.ErrnoException)?.code==='EACCES'?'missing_access':(e as NodeJS.ErrnoException)?.code==='ENOENT'?'not_configured':'unsupported'});
/** Explicitly bound recovery mirror. Counts only; no memory text, provenance text, or owner data. */
export function readMemoryStatus(path?:string, retrievals=0,lastRetrievalAt:number|null=null){
 if(!path)return {state:'not_configured'};
 let db:DatabaseSync|undefined;
 try{
  // Open cannot create a missing mirror, and no schema mutation is permitted.
  accessSync(path,constants.R_OK); // access/ENOENT classification without loading the database
  db=new DatabaseSync(path,{readOnly:true});
  const row=db.prepare(`SELECT COUNT(*) eligible FROM records WHERE kind='memories'
   AND CASE WHEN json_valid(body) THEN
    json_extract(body,'$.kind') IN ('operational-fact','execution-summary','retained-contract','lesson')
    AND json_extract(body,'$.status') IN ('retained','verified')
    AND (json_extract(body,'$.kind')<>'lesson' OR json_extract(body,'$.status')='verified') ELSE 0 END`).get();
  return {state:'connected',eligible:metric(row?.eligible)??0,retrievals:metric(retrievals)??0,lastRetrievalAt:metric(lastRetrievalAt)};
 }catch(e){return sourceFailure(e);}finally{db?.close();}
}
/** Reads only named setup guards; credentials and arbitrary policy fields never leave the server. */
export function readPolicyStatus(path?:string){
 if(!path)return {state:'not_configured'};
 try{
  const raw=readFileSync(path,'utf8');if(raw.length>65536)return {state:'unsupported'};
  const v=JSON.parse(raw);
  if(typeof v.paidApiSpending!=='boolean'||typeof v.externalActions!=='boolean')return {state:'unsupported'};
  return {state:'connected',paidApiSpending:v.paidApiSpending,externalActions:v.externalActions,tokenSafetyCeilingPerWorkflow:metric(v.tokenSafetyCeilingPerWorkflow)};
 }catch(e){return sourceFailure(e);}
}
interface Call {state?:string;phase?:string;roleId?:string|null;actualModel?:string|null;actualProvider?:string|null;startedAt?:number|null;inputTokens?:number|null;outputTokens?:number|null;durationMs?:number|null;generationRequests?:number|null;billingAmount?:number|null;runtimeSessionId?:string|null}
interface Workflow {state?:string;reviewPassed?:boolean|null}
interface Source {state?:string;observedAt?:number;count?:number;killSwitch?:boolean|null;gap?:string;items?:{state:string}[]}
interface Setup extends Source {calls?:Call[];workflows?:Workflow[];diagnostics?:{state?:string;roles?:number;retrievals?:number;lastRetrievalAt?:number|null;cooldowns?:{model:string;until:number}[]}}
interface Business extends Source {projectRef?:string;killSwitch?:boolean|null;tasks?:{state:string}[];senderHealth?:{state:string};sources?:Record<string,Source>;configuration?:{environmentKillSwitch?:boolean;outboundDisabled?:boolean;models?:{provider:string;model:string}[];modelRegistryState?:string}}
interface Armis extends Source {pending?:number|null;counts?:Record<string,number>}
interface Memory extends Source {eligible?:number;retrievals?:number;lastRetrievalAt?:number|null}
interface Work extends Source {version?:number;sessionId?:string;workerId?:string|null;task?:{lastUpdate?:number;state?:string;stale?:boolean;responsibleAgent?:string|null};steps?:unknown[];sessions?:Work[]}
interface Policy extends Source {paidApiSpending?:boolean;externalActions?:boolean;tokenSafetyCeilingPerWorkflow?:number|null}
export interface ConnectionInput {setup?:unknown;uditus?:unknown;armis?:unknown;memory?:unknown;work?:unknown;policy?:unknown;build?:{revision?:unknown;branch?:unknown}|null;now?:number}
/** Maps existing source readers, not newly invented executions, to the 23 UI diagnostics.
 * Freshness means a read succeeded. Historical receipts never imply present model availability.
 */
export function connectionReports(input:ConnectionInput):FeedReport[]{
 const now=input.now??Date.now(),s=(input.setup??{}) as Setup,u=(input.uditus??{}) as Business,a=(input.armis??{}) as Armis,m=(input.memory??{}) as Memory,w=(input.work??{}) as Work,p=(input.policy??{}) as Policy;
 const age=(v:Source)=>v.observedAt===undefined?0:now-v.observedAt;
 const state=(v:Source):Status=>v.state==='connected'?(age(v)>45000||age(v)<-30000?'stale':'ok'):v.state==='stale'?'stale':v.state==='missing_access'?'missing_access':v.state==='not_configured'?'not_configured':v.state==='error'?'error':'unsupported';
 const ss=state(s),as=state(a),ms=state(m);
 const ud=u.projectRef==='sgfgoezfazrweaycdlkq';
 const us=(name:string):Status=>!ud?'unsupported':age(u)>45000||age(u)<-30000?'stale':state(u.sources?.[name]??{});
 const combine=(...statuses:Status[]):Status=>statuses.includes('stale')?'stale':statuses.includes('missing_access')?'missing_access':statuses.includes('error')?'error':statuses.every(v=>v==='ok')?'ok':'partial';
 const calls=s.calls??[],flows=s.workflows??[],lastCall=calls.reduce<number|null>((t,c)=>metric(c.startedAt)===null?t:Math.max(t??0,c.startedAt!),null);
 const running=calls.filter(c=>c.state==='running').length,held=flows.filter(f=>f.state==='held').length;
 const records=(n:unknown)=>metric(n)??0;
 // V2 is a source-read envelope, not a session. Derive counts from bounded rows,
 // never from advertised totals, default profiles, or the number of tool requests.
 const v2=w.version===2,validEnvelope=!v2||Array.isArray(w.sessions)&&w.sessions.length<=32;
 const safeId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v)&&!/(?:\bsk-|AIza|gh[pousr]_|secret|password|token)/i.test(v);
 const aggregateStatus:Status=!validEnvelope?'unsupported':v2&&w.state==='connected'&&metric(w.observedAt)===null?'partial':state(w);
 const ids=new Set<string>();let unavailable=0,invalid=0;
 const native:Work[]=[];
 if(v2&&validEnvelope&&w.state==='connected')for(const row of w.sessions!){
  if(!row||!safeId(row.sessionId)||ids.has(row.sessionId)||!['connected','unavailable'].includes(row.state??'')){invalid++;continue;}
  ids.add(row.sessionId);
  if(row.state==='unavailable'){unavailable++;continue;}
  native.push(row);
 }
 else if(!v2&&w.state==='connected')native.push(w);
 const nativeCount=native.length;
 const nativeStatuses=native.map(row=>v2&&metric(row.observedAt)===null?'partial':state(row));
 let ws:Status=aggregateStatus;
 if(aggregateStatus==='ok')ws=combine('ok',...nativeStatuses,...(unavailable||invalid?['partial' as const]:[]));
 const nativeCheckedAt=Math.min(metric(w.observedAt)??now,...native.map(row=>metric(row.observedAt)??now));
 const combinedCheckedAt=Math.min(nativeCheckedAt,metric(s.observedAt)??now);
 const nativeLast=native.reduce<number|null>((last,row)=>metric(row.task?.lastUpdate)===null?last:Math.max(last??0,row.task!.lastUpdate!),null);
 const combinedLast=lastCall===null?nativeLast:nativeLast===null?lastCall:Math.max(lastCall,nativeLast);
 const roles=new Set(native.filter(row=>safeId(row.workerId)&&row.task?.responsibleAgent===row.workerId).map(row=>row.workerId));
 const nativeRoles=v2?roles.size:nativeCount; // Legacy transport is server-bound to the director.
 const unknownProgress=native.filter(row=>row.task?.stale===true||row.task?.state==='unknown'||metric(row.task?.lastUpdate)===null||row.task!.lastUpdate!>now||now-row.task!.lastUpdate!>=120000).length;
 let safeSteps=0,rejectedSteps=0,lastStep:number|null=null;
 for(const row of native){
  if(!Array.isArray(row.steps)||row.steps.length>500){rejectedSteps++;continue;}
  const stepIds=new Set<string>();
  for(const value of row.steps){
   const step=value as {id?:unknown;step?:unknown;state?:unknown;lastUpdate?:unknown}|null;
   if(!step||typeof step.step!=='string'||! /^[A-Za-z -]{1,80}$/.test(step.step)||v2&&(!safeId(step.id)||stepIds.has(step.id)||!['running','waiting','failed','completed','idle','unknown'].includes(String(step.state))||metric(step.lastUpdate)===null||Number(step.lastUpdate)>(row.observedAt??now))){rejectedSteps++;continue;}
   if(safeId(step.id))stepIds.add(step.id);safeSteps++;
   if(metric(step.lastUpdate)!==null)lastStep=Math.max(lastStep??0,Number(step.lastUpdate));
  }
 }
 const reports:Partial<Record<FeedId,FeedReport>>={};
 const put=(id:FeedId,status:Status,source:string,detail:string,count=0,observedAt=now,lastRecordAt:number|null=null)=>{
  const checkedAt=metric(observedAt)!==null&&observedAt<=now+30000?observedAt:now;
  reports[id]={id,status,source,detail:detail.slice(0,500),records:records(count),checkedAt,lastRecordAt:lastRecordAt!==null&&lastRecordAt<=checkedAt?lastRecordAt:null};
 };
 const bound=v2?`Aggregate source ${aggregateStatus}; ${nativeCount} connected native sessions; ${unavailable} unavailable; ${invalid} invalid/duplicate rows. Source-read freshness is not execution freshness. Quiet means idle, not disconnected.`:ws==='ok'?'Explicit default-profile thread read; '+(w.task?.state??'unknown')+'. Quiet means idle, not disconnected.':'Native source not configured, unreadable, or unsupported; execution unknown.';
 put('runtime',ws,'Bound native Hermes SessionDB',bound,nativeCount,nativeCheckedAt,nativeLast);
 const ds=s.diagnostics?.state==='connected'?'ok':'unsupported';
 put('organization',combine(ss,ds),'Setup viewer_events role bindings + native director binding',`${records(s.diagnostics?.roles)} installed role identities read. Installation is not execution. Full cross-company reporting-line telemetry is not configured.`,records(s.diagnostics?.roles),s.observedAt);
 put('workers',combine(ws,ss),'Native task + setup workflow/call rows',`${nativeRoles} explicit native role identities across ${nativeCount} connected sessions; ${unknownProgress} stale/unknown progress; ${running} recorded running calls; ${held} retained held workflows. Call rows are receipts, not distinct workers; no workers inferred from profiles.`,calls.length+nativeRoles,combinedCheckedAt,combinedLast);
 const sessions=calls.filter(c=>c.runtimeSessionId).length;
 put('sessions',combine(ws,ss),'Native session identity + provider receipt runtimeSessionId',`${nativeCount} connected native sessions; ${unavailable} unavailable; ${sessions} provider session receipts in latest ${calls.length} calls (not additional unique native identities). Missing finish/session receipts remain unknown.`,sessions+nativeCount,combinedCheckedAt,combinedLast);
 put('jobs',combine(ss,us('workshopTasks'),us('agentJobs')),'Setup workflows + Uditus workshop_tasks / agent_jobs',`${flows.length} recent internal workflows; ${records(u.sources?.workshopTasks?.count)} Uditus task rows; ${records(u.sources?.agentJobs?.count)} operation job rows. Empty is readable, not an executed workflow.`,flows.length+records(u.sources?.workshopTasks?.count)+records(u.sources?.agentJobs?.count),s.observedAt,lastCall);
 put('progress',ss,'Setup workflow outcomes and recorded review verdicts',`${flows.filter(f=>f.state==='completed').length} completed; ${flows.filter(f=>f.reviewPassed===true).length} passed reviews; ${held} held. No current turn acceptance inferred. Original acceptance is retained, not rerun.`,flows.length,s.observedAt,lastCall);
 put('handoffs',ss,'Setup calls.workflow / phase / role',`${calls.length} bounded recent call assignments; operations, execution, and independent-review transfers. Cross-department transport not configured.`,calls.length,s.observedAt,lastCall);
 put('tools',rejectedSteps&&ws==='ok'?'partial':ws,'Sanitized native tool-step metadata',`${safeSteps} safe current-turn steps across ${nativeCount} connected native sessions; ${unavailable} unavailable sessions; ${rejectedSteps} rejected step records. Tools are not workers. Private inputs and results are withheld.`,safeSteps,nativeCheckedAt,v2?lastStep:nativeLast);
 put('quality',combine(ss,us('workshopAttempts')),'Setup review verdicts + Uditus workshop_attempts',`${flows.filter(f=>f.reviewPassed===true).length} passed internal reviews; ${records(u.sources?.workshopAttempts?.count)} Uditus attempts. No business-path quality claimed from an empty table.`,flows.length+records(u.sources?.workshopAttempts?.count),s.observedAt,lastCall);
 put('artifacts',as,'Armis verified remote artifact counts',`${records(a.counts?.artifacts)} artifact records verified remotely. Text/receipt retention does not prove every claimed file or external effect exists.`,records(a.counts?.artifacts),a.observedAt);
 const observed=calls.filter(c=>c.actualModel&&c.actualProvider).length,activeCooldowns=s.diagnostics?.cooldowns?.filter(c=>c.until>now).length??0;
 put('capacity',ss==='ok'?'partial':ss,'Actual provider/model receipts + persisted runtime cooldowns',`Observed: ${[...new Set(calls.filter(c=>c.actualProvider&&c.actualModel).map(c=>c.actualProvider+'/'+c.actualModel))].slice(0,3).join(', ')||'none'}. Uditus configured: ${u.configuration?.models?.map(c=>c.provider+'/'+c.model).slice(0,3).join(', ')||'none'} (not executed here). ${activeCooldowns} active minimum cooldowns. Current availability and remaining allowance unknown; no supported shared quota/reset source. Historical ${observed} receipts are not availability.`,observed,s.observedAt,lastCall);
 const measured=calls.filter(c=>metric(c.inputTokens)!==null&&metric(c.outputTokens)!==null),tokens=measured.reduce((n,c)=>n+c.inputTokens!+c.outputTokens!,0);
 put('usage',ss==='ok'?'partial':ss,'Bounded setup call receipt usage fields',`${measured.length}/${calls.length} latest calls have measured tokens (${tokens}); ${calls.filter(c=>metric(c.durationMs)!==null).length} latency receipts; ${calls.filter(c=>metric(c.generationRequests)!==null).length} request-count receipts. Unmeasured/rejected usage stays unknown. Not provider-wide accounting.`,measured.length,s.observedAt,lastCall);
 const ps=state(p);
 put('budgets',combine(ss,ps)==='ok'?'partial':combine(ss,ps),'Bound setup policy guards + actual receipt billing fields',`Paid API spending ${p.paidApiSpending===false?'disabled':p.paidApiSpending===true?'enabled':'unknown'}; external actions ${p.externalActions===false?'disabled':'unknown'}; workflow token ceiling ${p.tokenSafetyCeilingPerWorkflow??'unknown'}. Monetary billing/remaining funds not supplied; no invented costs or quota.`,ps==='ok'?1:0,s.observedAt);
 put('machine','unsupported','Node process.platform (host identity only)',`Execution host is ${process.platform}. Mac-specific CPU/swap/disk telemetry is not supported on this host; optional generic resource telemetry is not integrated.`);
 const taskItems=u.tasks??[];
 put('scheduler',us('workshopTasks'),'Uditus workshop_tasks states/stages/dependencies/lease timestamps',`${taskItems.filter(t=>t.state==='running').length} running; ${taskItems.filter(t=>t.state==='held').length} held in bounded task sample. Worker execution remains paused. Reading leases is not an exercised claim/expiry/recovery path.`,records(u.sources?.workshopTasks?.count),u.observedAt);
 put('locks','unsupported','No general resource-ownership telemetry producer','Future multi-worker workspace/profile/browser lease ownership is not exported. Existing sync lock is not a general ownership feed. No new lock integration added.');
 const stopKnown=us('operationsControl')==='ok'&&typeof u.killSwitch==='boolean';
 const sender=u.senderHealth?.state==='unknown'?'Sender health unavailable (not configured: no observation).':u.senderHealth?.state==='stale'?'Sender health unavailable (stale observation).':us('senderHealth')==='missing_access'?'Sender health unavailable (missing access).':us('senderHealth')==='ok'&&u.senderHealth?.state==='observed'?'Sender-health observation present; freshness and send authorization still required.':'Sender health unavailable (unsupported or not configured source).';
 put('integrations',combine(as,ms,us('operationsControl'),us('workshopTasks')),'Armis remote digest/count cache + local memory mirror + exact Uditus REST reads',`Armis ${as}; sync pending ${a.pending??'unknown'}; ${records(m.eligible)} eligible operational memories; ${records(m.retrievals)} retrieval receipts. Uditus sources checked separately. ${sender} Commerce not applicable.`,records(m.eligible)+records(m.retrievals),as==='stale'?a.observedAt:now,metric(m.lastRetrievalAt));
 put('schedules',as,'Armis synchronization read-back observation time',`Last successful sync observation is timestamped; ${a.pending??'unknown'} pending. Recurring evidence producer only; next-run/service state not inferred. Uditus business schedule deliberately paused.`,as==='ok'?1:0,a.observedAt,a.observedAt??null);
 put('approvals',stopKnown&&u.configuration?.environmentKillSwitch===true&&u.configuration?.outboundDisabled===true?us('approvals')==='ok'?'ok':'partial':!ud?'unsupported':'partial','Uditus operations_control / batch_approvals + bound environment guards',`Database kill switch ${stopKnown?(u.killSwitch?'engaged':'DISENGAGED'):'unknown'}; environment kill switch ${u.configuration?.environmentKillSwitch===true?'engaged':'unknown or disabled'}; outbound ${u.configuration?.outboundDisabled===true?'disabled':'unknown or enabled'}; ${records(u.sources?.approvals?.count)} approval records. These are observed controls, not authority to send.`,records(u.sources?.approvals?.count)+(stopKnown?1:0),u.observedAt);
 put('results',combine(as,us('reports')),'Armis persisted outcome counts + Uditus stored artifact counts',`${records(a.counts?.outcomes)} internal outcomes; ${records(u.sources?.reports?.count)} stored Uditus artifacts. Internal acceptance is not publication, sending, revenue, or permission to execute.`,records(a.counts?.outcomes)+records(u.sources?.reports?.count));
 put('deployment',input.build&&typeof input.build.revision==='string'&&/^[a-f0-9]{40}$/.test(input.build.revision)?'ok':'not_configured','Build stamp loaded from actual served dist + schema read paths',`Served build stamp ${typeof input.build?.revision==='string'?input.build.revision.slice(0,12):'missing'}. Uditus task schema ${us('workshopTasks')}; Armis read-back ${as}. No deployment timestamp inferred.`);
 put('incidents',ss==='ok'?(held||activeCooldowns?'partial':'ok'):ss,'Retained held/rejected workflow receipts + sync state',`${held} retained held workflows; ${calls.filter(c=>c.state==='rejected'||c.state==='held').length} recent failed/held calls; ${activeCooldowns} active minimum cooldowns; sync ${as}. Missing old diagnostics and billing remain unknown; no automatic replay.`,held,s.observedAt,lastCall);
 put('ledger','not_applicable','None: Aster is outside current Armis/Uditus scope','Aster paper-trading ledger is not applicable. Trading stays paused; no positions or business activity created.');
 return FEEDS.map(([id])=>reports[id]!);
}
