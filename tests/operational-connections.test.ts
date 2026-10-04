import {describe,it,expect} from 'vitest';
import {connectionReports, readMemoryStatus, readPolicyStatus} from '../server/connections';
import {decodeFeedReports, FEEDS, feedWorking, FEED_SCOPE} from '../src/core/connections';
import {DatabaseSync} from 'node:sqlite';
import {CurrentWork} from '../server/current-work';
import {mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';

describe('operational connection evidence',()=>{
 const now=100000;
 const setup={state:'connected',observedAt:now,calls:[{state:'completed',phase:'review',roleId:'armis.auditor',startedAt:90000,actualProvider:'gemini',actualModel:'observed-model',inputTokens:20,outputTokens:10}],workflows:[{state:'completed',reviewPassed:true}],diagnostics:{state:'connected',roles:3,retrievals:1,cooldowns:[]}};
 const business={state:'connected',projectRef:'sgfgoezfazrweaycdlkq',observedAt:now,killSwitch:true,tasks:[],senderHealth:{state:'unknown'},sources:{operationsControl:{state:'connected',count:1},workshopTasks:{state:'connected',count:0,items:[]},workshopAttempts:{state:'connected',count:0},agentJobs:{state:'connected',count:0},reports:{state:'connected',count:2},senderHealth:{state:'unavailable',gap:'No sender observation'},approvals:{state:'connected',count:0}},configuration:{environmentKillSwitch:true,outboundDisabled:true,models:[{model:'unobserved-model',provider:'gemini'}]}};
 const armis={state:'connected',observedAt:now,pending:0,counts:{artifacts:3,memories:4,outcomes:2}};
 const memory={state:'connected',eligible:2,retrievals:1,lastRetrievalAt:90000};
 const work={state:'connected',observedAt:now,task:{lastUpdate:90000,state:'idle'},steps:[]};
 const input={setup,uditus:business,armis,memory,work,policy:{state:'connected',paidApiSpending:false,externalActions:false,tokenSafetyCeilingPerWorkflow:10000},build:{revision:'a'.repeat(40),branch:'reviewable'},now};
 it('accounts for all 23 feeds exactly once with scope and actual source; quiet is not disconnected',()=>{
  const reports=connectionReports(input);expect(reports).toHaveLength(23);expect(new Set(reports.map(r=>r.id)).size).toBe(23);
  expect(Object.keys(FEED_SCOPE).sort()).toEqual(FEEDS.map(f=>f[0]).sort());expect(decodeFeedReports(reports,now)).toEqual(reports);
  expect(reports.every(r=>r.source&&r.detail)).toBe(true);expect(reports.find(r=>r.id==='runtime')?.status).toBe('ok');
  expect(reports.find(r=>r.id==='ledger')?.status).toBe('not_applicable');expect(reports.find(r=>r.id==='locks')?.status).toBe('unsupported');
 });
 it('never converts historical model receipts, configured registry entries, or absent quotas/billing into availability',()=>{
  const reports=connectionReports(input);for(const id of ['capacity','budgets','usage'])expect(feedWorking(reports.find(r=>r.id===id),true,now)).toBe(false);
  expect(reports.find(r=>r.id==='capacity')?.detail).toContain('remaining allowance unknown');
  expect(reports.find(r=>r.id==='integrations')?.detail).toContain('Sender health unavailable');
 });
 it('fails closed for stale sync, unknown stop control, partial sources and wrong Uditus project',()=>{
  let reports=connectionReports({...input,armis:{...armis,state:'stale',observedAt:1}});expect(reports.find(r=>r.id==='integrations')?.status).toBe('stale');expect(reports.find(r=>r.id==='integrations')?.checkedAt).toBe(1);
  reports=connectionReports({...input,uditus:{...business,projectRef:'other'}});expect(reports.find(r=>r.id==='approvals')?.status).toBe('unsupported');
  reports=connectionReports({...input,uditus:{...business,killSwitch:null}});expect(reports.find(r=>r.id==='approvals')?.status).toBe('partial');
  reports=connectionReports({...input,setup:{state:'unavailable'}});expect(reports.find(r=>r.id==='handoffs')?.status).not.toBe('ok');
 });
 const nativeSession=(id:string,workerId:string|null=null,observedAt=now)=>({state:'connected',sessionId:id,workerId,observedAt,task:{state:'idle',responsibleAgent:workerId,lastUpdate:90000,stale:false},steps:[{id:id+'-step',step:'Inspect a file',state:'completed',startedAt:80000,lastUpdate:90000}]});
 const nativeWork=(sessions:unknown[])=>({version:2,state:'connected',observedAt:now,sessions,sessionCount:999,boundRoleCount:999});
 it('projects actual v2 reader output from a synthetic database into five sessions and five tools',()=>{
  const dir=mkdtempSync(`${process.env.TMPDIR}/connection-native-`),path=dir+'/fixture.db',db=new DatabaseSync(path);
  let reader:CurrentWork|undefined;
  try{
   db.exec(`CREATE TABLE sessions(id TEXT,source TEXT,profile_name TEXT,started_at REAL,ended_at REAL,model TEXT,last_activity_at REAL,last_activity_provenance TEXT);
    CREATE TABLE messages(id INTEGER PRIMARY KEY,session_id TEXT,role TEXT,timestamp REAL,finish_reason TEXT,tool_calls TEXT,tool_call_id TEXT,content TEXT,active INTEGER DEFAULT 1);`);
   const ids=Array.from({length:5},(_,i)=>'fixture-'+i);
   ids.forEach((id,i)=>{
    db.prepare('INSERT INTO sessions VALUES(?,?,?,80,NULL,?,90,?)').run(id,'cli','default','configured-model','unknown');
    db.prepare('INSERT INTO messages VALUES(?,?,?,80,NULL,NULL,NULL,?,1)').run(i*2+1,id,'user','PRIVATE fixture prompt');
    db.prepare('INSERT INTO messages VALUES(?,?,?,90,?,?,NULL,?,1)').run(i*2+2,id,'assistant','tool_calls',JSON.stringify([{id:'call-'+i,function:{name:'read_file',arguments:'PRIVATE fixture arguments'}}]),'PRIVATE fixture reasoning');
   });
   reader=new CurrentWork(path,{sessionIds:ids});
   const reports=connectionReports({...input,work:reader.read(now)});
   for(const id of ['runtime','sessions','tools'])expect(reports.find(r=>r.id===id)).toMatchObject({status:'ok',records:5,lastRecordAt:90000});
   expect(reports.find(r=>r.id==='workers')?.detail).toContain('0 explicit native role identities');
   expect(JSON.stringify(reports)).not.toContain('PRIVATE');
  }finally{reader?.close();db.close();rmSync(dir,{recursive:true});}
 });
 it('counts five explicit v2 sessions and their safe steps, not the aggregate envelope or profiles',()=>{
  const reports=connectionReports({...input,work:nativeWork(Array.from({length:5},(_,i)=>nativeSession('session-'+i)))});
  for(const id of ['runtime','sessions','tools'])expect(reports.find(r=>r.id===id)).toMatchObject({status:'ok',records:5,checkedAt:now,lastRecordAt:90000});
  expect(reports.find(r=>r.id==='workers')?.detail).toContain('0 explicit native role identities');
  expect(reports.find(r=>r.id==='workers')?.records).toBe(setup.calls.length);
  expect(decodeFeedReports(reports,now)).toEqual(reports);
 });
 it('separates available aggregate reads, unavailable sessions and unique explicit role identities',()=>{
  const sessions=[nativeSession('one','armis.ceo'),nativeSession('two','armis.ceo'),nativeSession('three'),{state:'unavailable',sessionId:'four',workerId:'armis.auditor',observedAt:now}];
  const reports=connectionReports({...input,work:nativeWork(sessions)});
  expect(reports.find(r=>r.id==='runtime')).toMatchObject({status:'partial',records:3});
  expect(reports.find(r=>r.id==='runtime')?.detail).toContain('Aggregate source ok; 3 connected native sessions; 1 unavailable');
  expect(reports.find(r=>r.id==='workers')?.detail).toContain('1 explicit native role identities');
  expect(reports.find(r=>r.id==='workers')?.records).toBe(2);
  expect(reports.find(r=>r.id==='tools')).toMatchObject({status:'partial',records:3});
 });
 it('does not invent a session from a connected empty or entirely unavailable aggregate',()=>{
  for(const sessions of [[],[{state:'unavailable',sessionId:'missing',workerId:null,observedAt:now}]]){
   const reports=connectionReports({...input,work:nativeWork(sessions)});
   for(const id of ['runtime','sessions','tools'])expect(reports.find(r=>r.id===id)).toMatchObject({records:0});
   expect(reports.find(r=>r.id==='runtime')?.status).toBe(sessions.length?'partial':'ok');
  }
 });
 it('retains native source freshness in combined feeds and distinguishes stale progress from stale reads',()=>{
  const session=nativeSession('old','armis.ceo',1);
  let reports=connectionReports({...input,work:nativeWork([session])});
  for(const id of ['runtime','workers','sessions','tools'])expect(reports.find(r=>r.id===id)).toMatchObject({status:'stale',checkedAt:1});
  reports=connectionReports({...input,work:nativeWork([{...nativeSession('quiet'),task:{state:'completed',lastUpdate:1,stale:true}}])});
  expect(reports.find(r=>r.id==='runtime')).toMatchObject({status:'ok',checkedAt:now,lastRecordAt:1});
  expect(reports.find(r=>r.id==='workers')?.detail).toContain('1 stale/unknown progress');
  reports=connectionReports({...input,setup:{...setup,observedAt:1},work:nativeWork([nativeSession('fresh')])});
  for(const id of ['workers','sessions'])expect(reports.find(r=>r.id===id)).toMatchObject({status:'stale',checkedAt:1});
 });
 it('counts only safe step metadata and valid unique session identities',()=>{
  const session=nativeSession('safe');
  const reports=connectionReports({...input,work:nativeWork([{...session,steps:[...session.steps,null,{id:'unsafe',step:'private payload <secret>',state:'completed',lastUpdate:90000},session.steps[0]]},session,{...session,sessionId:'secret-token'}])});
  expect(reports.find(r=>r.id==='runtime')).toMatchObject({status:'partial',records:1});
  expect(reports.find(r=>r.id==='tools')).toMatchObject({status:'partial',records:1});
  expect(JSON.stringify(reports)).not.toContain('private payload');
 });
 it('does not treat malformed v2 data or missing session observation clocks as fresh legacy work',()=>{
  let reports=connectionReports({...input,work:{version:2,state:'connected',observedAt:now}});
  expect(reports.find(r=>r.id==='runtime')).toMatchObject({status:'unsupported',records:0});
  reports=connectionReports({...input,work:nativeWork([{...nativeSession('missing-clock'),observedAt:undefined}])});
  expect(reports.find(r=>r.id==='runtime')?.status).not.toBe('ok');
  reports=connectionReports({...input,work:{...nativeWork([nativeSession('missing-envelope-clock')]),observedAt:undefined}});
  expect(reports.find(r=>r.id==='runtime')?.status).toBe('partial');
  reports=connectionReports({...input,work:nativeWork([nativeSession('future',null,now+30001)])});
  expect(reports.find(r=>r.id==='runtime')?.status).toBe('stale');
  expect(decodeFeedReports(reports,now)).toEqual(reports);
 });
 it('timestamps tools from safe steps rather than newer task progress',()=>{
  const session=nativeSession('progress');
  const reports=connectionReports({...input,work:nativeWork([{...session,task:{...session.task,lastUpdate:95000}}])});
  expect(reports.find(r=>r.id==='runtime')?.lastRecordAt).toBe(95000);
  expect(reports.find(r=>r.id==='tools')?.lastRecordAt).toBe(90000);
 });
 it('preserves legacy single-session counts, steps, idle status and receipt accounting',()=>{
  const reports=connectionReports({...input,work:{...work,sessionId:'legacy',steps:[{step:'Run a command'}]},setup:{...setup,calls:[{...setup.calls[0],runtimeSessionId:'receipt'}]}});
  expect(reports.find(r=>r.id==='runtime')).toMatchObject({status:'ok',records:1});
  expect(reports.find(r=>r.id==='sessions')).toMatchObject({status:'ok',records:2});
  expect(reports.find(r=>r.id==='tools')).toMatchObject({status:'ok',records:1});
 });
 it('reports missing access and excludes private, proposed, or unverified lessons from memory counts',()=>{
  const dir=mkdtempSync(`${process.env.TMPDIR}/connection-memory-`),path=dir+'/outbox.db';
  expect(readMemoryStatus(path,1)).toMatchObject({state:'not_configured'});expect(existsSync(path)).toBe(false);
  const db=new DatabaseSync(path);db.exec('CREATE TABLE records(kind TEXT,body TEXT)');
  for(const [kind,status] of [['operational-fact','retained'],['lesson','verified'],['lesson','retained'],['owner-profile','verified'],['agent-memory','retained'],['operational-fact','proposed']])db.prepare('INSERT INTO records VALUES(?,?)').run('memories',JSON.stringify({kind,status,text:'private payload'}));
  db.close();expect(readMemoryStatus(path,1)).toMatchObject({state:'connected',eligible:2});expect(JSON.stringify(readMemoryStatus(path,1))).not.toContain('private');
  writeFileSync(dir+'/policy.json',JSON.stringify({paidApiSpending:false,externalActions:false,tokenSafetyCeilingPerWorkflow:9000,password:'private payload'}));
  expect(readPolicyStatus(dir+'/policy.json')).toMatchObject({paidApiSpending:false,externalActions:false});expect(JSON.stringify(readPolicyStatus(dir+'/policy.json'))).not.toContain('private');rmSync(dir,{recursive:true});
 });
 it('identifies configured versus observed model routes and the exact missing sender observation',()=>{
  const reports=connectionReports(input);
  expect(reports.find(r=>r.id==='capacity')?.detail).toContain('gemini/observed-model');
  expect(reports.find(r=>r.id==='capacity')?.detail).toContain('configured: gemini/unobserved-model');
  expect(reports.find(r=>r.id==='integrations')?.detail).toContain('Sender health unavailable (not configured: no observation)');
 });
 it('rejects malformed status/source text and keeps new states non-green',()=>{
  for(const status of ['partial','missing_access','unsupported','stale','not_applicable','blocked'] as const){const r={id:'capacity' as const,status,checkedAt:now,lastRecordAt:null,records:0,detail:'Specific source reason',source:'Receipt journal'};expect(decodeFeedReports([r],now)).toEqual([r]);expect(feedWorking(r,true,now)).toBe(false);}
  expect(decodeFeedReports([{id:'runtime',status:'ok',checkedAt:now,lastRecordAt:null,records:0,detail:'x',source:'x'.repeat(301)}],now)).toBeNull();
 });
});
