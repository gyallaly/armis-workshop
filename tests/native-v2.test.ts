import {test,expect} from 'vitest';
import {currentWorkEvents} from '../src/adapters/current-work';
import {initialState,reduce} from '../src/core/reducer';
import {ROSTER} from '../src/core/config';
test('verified native work renders one canonical director, not one worker per tool',()=>{
 const value={state:'connected',sessionId:'bound-session',observedAt:2000,task:{id:'bound-turn',state:'running',lastUpdate:1900},steps:[{step:'Inspect a file'},{step:'Run a command'}]};
 const events=currentWorkEvents(value);expect(events).toHaveLength(4);
 const state=reduce(initialState(ROSTER,'connected',2000),{kind:'events',events});
 expect(state.statuses['armis.ceo']?.state).toBe('active');expect(Object.values(state.statuses).filter(s=>s.state==='active')).toHaveLength(1);expect(state.tasks['bound-turn']?.status).toBe('in_progress');
 expect(currentWorkEvents({state:'unavailable'})).toEqual([]);
 expect(()=>currentWorkEvents({...value,task:{...value.task,state:'imaginary'}})).toThrow();
});
test('unsupported versions and noncurrent enrollment never become director activity',()=>{
 const value={state:'connected',sessionId:'bound-session',observedAt:2000,task:{id:'bound-turn',state:'running',lastUpdate:1900}};
 expect(()=>currentWorkEvents({...value,version:3})).toThrow();
 const session={...value,workerId:'armis.ceo',task:{...value.task,responsibleAgent:'armis.ceo'},enrollment:{status:'revoked',actorId:'owner',jobId:'job',attemptId:'attempt',provenance:'owner-attested',evidenceId:'attestation',enrolledAt:1000,expiresAt:5000,revokedAt:1500}};
 expect(()=>currentWorkEvents({version:2,state:'connected',observedAt:2000,sessions:[session]})).toThrow();
 expect(()=>currentWorkEvents({version:2,state:'connected',observedAt:2000,sessions:[{...session,enrollment:{...session.enrollment,status:'current',revokedAt:null,enrolledAt:3000}}]})).toThrow();
});
