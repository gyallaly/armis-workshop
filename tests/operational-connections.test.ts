import {describe,it,expect} from 'vitest';
import {connectionReports, readMemoryStatus, readPolicyStatus} from '../server/connections';
import {decodeFeedReports, FEEDS, feedWorking, FEED_SCOPE} from '../src/core/connections';
import {DatabaseSync} from 'node:sqlite';
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
