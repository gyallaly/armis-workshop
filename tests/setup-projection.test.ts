import {test,expect} from 'vitest';
import {project} from '../server/observations';
import {mkdtempSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {Journal} from '../server/journal';
import {projectSnapshot} from '../src/adapters/live/projection';
test('trusted setup acceptance maps actual installed roles and accepted internal results',()=>{
 const base={version:1,mode:'live',source:'armis-setup-runtime',businessId:'armis',workerId:'armis.operations',sessionId:'actual-session',mandateId:null,attemptId:null};
 const s=projectSnapshot([
  {...base,eventId:'install',cursor:1,type:'source.connected',occurredAt:100,data:{installed:true,profileName:'armis-armis-operations'},taskId:null},
  {...base,eventId:'queued',cursor:2,type:'task.queued',occurredAt:101,data:{parentTaskId:'parent'},taskId:'child'},
  {...base,eventId:'done',cursor:3,type:'task.completed',occurredAt:102,data:{accepted:true,state:'ready',outcome:'completed'},taskId:'child'},
 ],103);
 expect(s.workers[0]?.installation?.installed).toBe(true);
 expect(s.workers[0]?.installation?.roleBinding).toBe('verified');
 expect(s.tasks[0]?.status).toBe('ready');
 expect(s.tasks[0]?.parentTaskId).toBe('parent');
 });
 test('server journal allowlist preserves trusted setup identity, relationships and acceptance',()=>{
 const body={version:1,mode:'live',provenance:'observed',sourceSequence:null,receivedAt:100,occurredAt:100,eventId:'e',source:'armis-setup-runtime',type:'task.completed',businessId:'armis',workerId:'armis.operations',taskId:'t',attemptId:null,sessionId:'s',mandateId:null,data:{installed:true,accepted:true,parentTaskId:'p',profileName:'operations',state:'ready',outcome:'completed'}};
 const p=project({cursor:1,event_id:'e',body:JSON.stringify(body)});
 expect(p.data).toMatchObject(body.data);
 const untrusted=project({cursor:1,event_id:'e',body:JSON.stringify({...body,source:'other-source'})});
 expect(untrusted.data.installed).toBeUndefined();expect(untrusted.data.accepted).toBeUndefined();
 });
