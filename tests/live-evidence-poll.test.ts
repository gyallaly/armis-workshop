import {afterEach,expect,it,vi} from 'vitest';
import {LiveBridgeAdapter,nativeSessions} from '../src/adapters/live';
import {diagnostics} from '../src/core/connections';
import type {AdapterSink} from '../src/adapters/adapter';
const sink=():AdapterSink=>({snapshot:vi.fn(),events:vi.fn(),connection:vi.fn(),tick:vi.fn(),reset:vi.fn()});
class Stream {close=vi.fn();addEventListener=vi.fn();constructor(..._args:unknown[]){} }
const report={id:'runtime',status:'ok',checkedAt:1000,lastRecordAt:null,records:0,detail:'Checked source'};
const flush=async()=>{await vi.advanceTimersByTimeAsync(0);};
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('polls authenticated supplemental evidence, preserving source timestamps and sanitizing sessions',async()=>{
 vi.useFakeTimers();vi.setSystemTime(100000);vi.stubGlobal('EventSource',Stream);
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({reports:[report],currentWork:{version:2,state:'connected',observedAt:100000,sessions:[{sessionId:'20261003_192208_b0e017',state:'connected',workerId:null,task:{state:'running',currentStep:'Inspect a file',lastUpdate:99000,stale:false},configuredModel:'gpt-6.1-sol',actualModel:null,privatePrompt:'DO NOT DISPLAY'}],sessionCount:1,boundRoleCount:0,independentAcceptance:'not observed'}})));
 vi.stubGlobal('fetch',fetch);const a=new LiveBridgeAdapter('http://localhost/api/events');a.start(sink());await flush();
 expect(fetch).toHaveBeenCalledWith('http://localhost/api/evidence',expect.objectContaining({method:'GET',credentials:'include',cache:'no-store',signal:expect.any(AbortSignal)}));
 expect(diagnostics.get().feeds.runtime?.checkedAt).toBe(1000);expect(nativeSessions.get().sessions).toHaveLength(1);expect(JSON.stringify(nativeSessions.get())).not.toContain('DO NOT DISPLAY');a.stop();
});
it('bounds requests, rejects oversized evidence and prevents late stopped results',async()=>{
 vi.useFakeTimers();vi.stubGlobal('EventSource',Stream);let resolve!:(r:Response)=>void;
 const fetch=vi.fn(()=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal('fetch',fetch);
 const a=new LiveBridgeAdapter('http://localhost/api/events');a.start(sink());await vi.advanceTimersByTimeAsync(4000);expect(fetch).toHaveBeenCalledTimes(1);
 a.stop();resolve(new Response(JSON.stringify({reports:[{...report,checkedAt:Date.now()}]})));await flush();expect(diagnostics.get().feeds).toEqual({});expect(nativeSessions.get().status).toBe('not_reported');
 fetch.mockImplementation(()=>Promise.resolve(new Response('x'.repeat(262145))));a.start(sink());await flush();expect(nativeSessions.get().status).toBe('degraded');expect(diagnostics.get().feeds).toEqual({});a.stop();
});
it('expires hung polls and fences results from a replaced source',async()=>{
 vi.useFakeTimers();vi.stubGlobal('EventSource',Stream);let resolve!:(r:Response)=>void;
 const fetch=vi.fn(()=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal('fetch',fetch);const a=new LiveBridgeAdapter('http://localhost/api/events');a.start(sink());await vi.advanceTimersByTimeAsync(5001);expect(nativeSessions.get().status).toBe('degraded');
 const oldResolve=resolve;a.start(sink());oldResolve(new Response(JSON.stringify({reports:[report]})));await flush();expect(diagnostics.get().feeds).toEqual({});a.stop();
});
it('retries every 15 seconds without refreshing transport or replacing newer source checks',async()=>{
 vi.useFakeTimers();vi.setSystemTime(100000);vi.stubGlobal('EventSource',Stream);
 const fetch=vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({reports:[report]}))));
 vi.stubGlobal('fetch',fetch);const a=new LiveBridgeAdapter('http://localhost/api/events');a.start(sink());await flush();
 expect(diagnostics.get().lastValidAt).toBeNull();
 diagnostics.update({feeds:{runtime:{...report,id:'runtime',status:'ok',checkedAt:99000}}});
 await vi.advanceTimersByTimeAsync(15000);expect(fetch).toHaveBeenCalledTimes(2);expect(diagnostics.get().feeds.runtime?.checkedAt).toBe(99000);a.stop();
});
it('keeps auth failures unknown and does not accept malformed source reports',async()=>{
 vi.useFakeTimers();vi.stubGlobal('EventSource',Stream);
 const fetch=vi.fn().mockResolvedValue(new Response('',{status:401}));vi.stubGlobal('fetch',fetch);
 const a=new LiveBridgeAdapter('http://localhost/api/events');a.start(sink());await flush();expect(nativeSessions.get().status).toBe('degraded');expect(diagnostics.get().feeds).toEqual({});
 fetch.mockResolvedValue(new Response(JSON.stringify({reports:[{...report,status:'fictional'}]})));await vi.advanceTimersByTimeAsync(15000);expect(diagnostics.get().feeds).toEqual({});a.stop();
});
