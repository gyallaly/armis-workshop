import {test,expect} from 'vitest';
import {projectSnapshot,observedWorker} from '../src/adapters/live/projection';
import {ROSTER,DEPARTMENT_BY_ID} from '../src/core/config';

test('real installed roles retain declared homes and finished provider receipts',()=>{
 for(const role of ['armis.ceo','armis.operations','armis.audit','uditus.ceo'])expect(observedWorker(role).homeDepartmentId).toBe(ROSTER.find(w=>w.id===role)?.homeDepartmentId);
 for(const role of ['armis.operator','armis.auditor'])expect(DEPARTMENT_BY_ID[observedWorker(role).homeDepartmentId]).toBeDefined();
 const base={version:1,mode:'live',source:'armis-setup-runtime',businessId:'armis',workerId:'armis.operator',sessionId:'actual-session',mandateId:null,attemptId:'attempt-one',taskId:'task-one'};
 const s=projectSnapshot([
  {...base,eventId:'queued',cursor:1,type:'task.queued',occurredAt:100,data:{parentTaskId:'parent-one',installed:true,profileName:'operator'}},
  {...base,eventId:'start',cursor:2,type:'attempt.started',occurredAt:101,data:{requestedModel:'requested'}},
  {...base,eventId:'active',cursor:3,type:'attempt.activity',occurredAt:102,data:{}},
  {...base,eventId:'finish',cursor:4,type:'attempt.finished',occurredAt:103,data:{provider:'gemini',actualModel:'observed',outcome:'completed'}},
  {...base,eventId:'complete',cursor:5,type:'task.completed',occurredAt:104,data:{accepted:true}},
  {...base,eventId:'idle',cursor:6,type:'worker.idle',occurredAt:105,data:{}},
 ],106);
 expect(s.attempts[0]?.provider).toMatchObject({provider:'gemini',model:'observed',modelProvenance:'provider_reported'});
 expect(s.tasks[0]?.parentTaskId).toBe('parent-one');
 expect(s.statuses[0]?.state).toBe('idle');
});
