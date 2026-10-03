import {test,expect} from 'vitest';
import {LiveAdapter} from '../src/adapters/live/liveAdapter';
import {initialState,reduce} from '../src/core/reducer';
import {displayStatus} from '../src/core/selectors';

test('native work reaches the existing Managing Director character without inventing a worker attempt',()=>{
 let state=initialState([], 'disconnected',2500);
 const listeners:Record<string,(e:{data:string})=>void>={};
 const adapter=new LiveAdapter({now:()=>2500,createStream:()=>({addEventListener:(k,h)=>{listeners[k]=h;},onerror:null,close:()=>{}})});
 adapter.start({reset:()=>{state=initialState([],'disconnected',2500);},snapshot:(snapshot,connection)=>{state=reduce(state,{kind:'snapshot',snapshot,connection});},events:events=>{state=reduce(state,{kind:'events',events});},connection:connection=>{state=reduce(state,{kind:'connection',connection});},tick:now=>{state=reduce(state,{kind:'tick',now});}});
 const work={state:'connected',sessionId:'bound-session',observedAt:2500,task:{id:'bound-session:turn:1',title:'Finish Workshop and Armis setup',state:'running',lastUpdate:2000,stale:false},steps:[{id:'call-one',step:'Run a command',state:'running',lastUpdate:2000}]};
 try{
 listeners.snapshot!({data:JSON.stringify({version:1,epoch:'epoch',cursor:0,mode:'live',observations:[],currentWork:work})});
 expect(state.workers['armis.ceo']).toBeDefined();
 expect(displayStatus(state,state.workers['armis.ceo']!).state).toBe('active');
 expect(state.statuses['armis.ceo']?.taskId).toBe(work.task.id);
 expect(state.tasks[work.task.id]?.assignedWorkerId).toBe('armis.ceo');
 expect(Object.values(state.attempts)).toHaveLength(0);
 listeners['current-work']!({data:JSON.stringify({version:1,epoch:'epoch',cursor:0,currentWork:{...work,observedAt:2600,task:{...work.task,state:'waiting',lastUpdate:2600}}})});
 expect(state.statuses['armis.ceo']?.state).toBe('waiting_approval');
 listeners['current-work']!({data:JSON.stringify({version:1,epoch:'epoch',cursor:0,currentWork:{...work,observedAt:2700,task:{...work.task,state:'completed',lastUpdate:2700}}})});
 expect(state.statuses['armis.ceo']?.state).toBe('idle');
 expect(state.tasks[work.task.id]?.status).not.toBe('ready'); // response is not independently accepted
 }finally{adapter.stop();}
});
