import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeBridgeMessage, LiveBridgeAdapter } from '../src/adapters/live';
import { DemoSim } from '../src/adapters/demo/sim';
import type { AdapterSink } from '../src/adapters/adapter';
import { diagnostics, feedWorking } from '../src/core/connections';

function snapshot() {
  const sim = new DemoSim(7,'steady');
  sim.advanceTo(sim.loadAt + 50_000);
  return sim.snapshot();
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('read-only telemetry boundary', () => {
  it('accepts declared identities and failed-attempt observations without inventing sessions', () => {
    const s = snapshot();
    const result = decodeBridgeMessage(JSON.stringify({type:'snapshot',snapshot:s}),s.takenAt);
    expect(result?.type).toBe('snapshot');
    if (result?.type === 'snapshot') expect(result.snapshot.workers).toHaveLength(29);
  });
  it('rejects foreign identities, cross-company observations and future snapshots', () => {
    const s = snapshot();
    expect(decodeBridgeMessage(JSON.stringify({type:'snapshot',snapshot:{...s,takenAt:s.takenAt + 30_001}}),s.takenAt)).toBeNull();
    expect(decodeBridgeMessage(JSON.stringify({type:'snapshot',snapshot:{...s,workers:[{...s.workers[0],id:'fictional'}]}}),s.takenAt)).toBeNull();
    const event = {id:'bad',type:'worker.state',businessId:'uditus',workerId:'etsy.creator',sourceTs:s.takenAt,payload:{state:'active',departmentId:'uditus:delivery'}};
    expect(decodeBridgeMessage(JSON.stringify({type:'events',events:[event]}),s.takenAt)).toBeNull();
    expect(decodeBridgeMessage('invalid',s.takenAt)).toBeNull();
  });
  it('requires snapshots before events and after reconnect, then closes the stream', () => {
    vi.useFakeTimers();
    class Stream {
      static current: Stream;
      onmessage: ((event:{data:string})=>void) | null = null;
      onerror: (()=>void) | null = null;
      close = vi.fn();
      constructor() { Stream.current = this; }
      send(value:unknown) { this.onmessage?.({data:JSON.stringify(value)}); }
    }
    vi.stubGlobal('EventSource',Stream);
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('Supplemental source not available in this SSE test')));
    const sink:AdapterSink = {snapshot:vi.fn(),events:vi.fn(),connection:vi.fn(),tick:vi.fn(),reset:vi.fn()};
    const adapter = new LiveBridgeAdapter('http://localhost/telemetry');
    adapter.start(sink);
    const s = snapshot(); vi.setSystemTime(s.takenAt);
    const events = {type:'events',events:[{id:'rest',type:'worker.state',businessId:'uditus',workerId:'uditus.creator',sourceTs:s.takenAt,payload:{state:'idle',departmentId:'uditus:lounge'}}]};
    Stream.current.send(events); expect(sink.events).not.toHaveBeenCalled();
    Stream.current.send({type:'snapshot',snapshot:s}); expect(sink.snapshot).toHaveBeenCalledOnce();
    Stream.current.send({type:'health',feeds:[{id:'workers',status:'ok',checkedAt:s.takenAt,lastRecordAt:null,records:0,detail:'Runtime source checked'}]});
    expect(feedWorking(diagnostics.get().feeds.workers,true,s.takenAt)).toBe(true);
    Stream.current.send(events); expect(sink.events).toHaveBeenCalledOnce();
    Stream.current.onerror?.(); Stream.current.send(events); expect(sink.events).toHaveBeenCalledOnce();
    Stream.current.send({type:'snapshot',snapshot:s}); Stream.current.send(events); expect(sink.events).toHaveBeenCalledTimes(2);
    expect(diagnostics.get().feeds).toEqual({});
    expect(diagnostics.get().acceptedSnapshots).toBe(2);
    expect(diagnostics.get().acceptedEvents).toBe(2);
    expect(diagnostics.get().rejectedMessages).toBe(2);
    expect(adapter.requestRedirect().accepted).toBe(false);
    adapter.stop(); expect(Stream.current.close).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
});
