import { describe, it, expect, vi } from 'vitest';
import { LiveAdapter } from '../src/adapters/live/liveAdapter';
import type { AdapterSink } from '../src/adapters/adapter';

class Stream {
  handlers = new Map<string, (e: { data: string }) => void>();
  onerror: (() => void) | null = null;
  closed = false;
  addEventListener(t: string, f: (e: { data: string }) => void) { this.handlers.set(t, f); }
  close() { this.closed = true; }
  send(t: string, d: unknown) { this.handlers.get(t)?.({ data: JSON.stringify(d) }); }
}
function setup() {
  const streams: Stream[] = [];
  const sink: AdapterSink = { snapshot: vi.fn(), events: vi.fn(), connection: vi.fn(), tick: vi.fn(), reset: vi.fn() };
  const adapter = new LiveAdapter({ createStream: () => { const s = new Stream(); streams.push(s); return s; }, now: () => Date.now() });
  adapter.start(sink);
  return { adapter, streams, sink };
}
const boot = { version: 1, mode: 'live', epoch: 'server-1', cursor: 0, observations: [] };
describe('read-only live transport', () => {
  it('starts empty and does not trust connection open as telemetry', () => {
    const { adapter, streams, sink } = setup();
    expect(sink.snapshot).not.toHaveBeenCalled();
    streams[0]!.send('snapshot', boot);
    expect(sink.snapshot).toHaveBeenCalledWith(expect.objectContaining({ workers: [], tasks: [], capacity: [] }), 'connected');
    expect(adapter.capabilities).toEqual({ redirect: false, controls: false });
    expect(adapter.requestRedirect().accepted).toBe(false);
    adapter.stop();
  });
  it('requires a snapshot first, validates cursor chain, drops duplicates and ignores old callbacks', () => {
    const { adapter, streams, sink } = setup();
    const old = streams[0]!;
    old.send('events', { version: 1, epoch: 'server-1', previousCursor: 0, cursor: 1, observations: [] });
    expect(sink.events).not.toHaveBeenCalled();
    expect(adapter.diagnostics.rejected).toBe(1);
    old.send('snapshot', boot);
    old.send('events', { version: 1, epoch: 'server-1', previousCursor: 0, cursor: 0, observations: [] });
    expect(sink.events).not.toHaveBeenCalled();
    old.send('events', { version: 1, epoch: 'server-1', previousCursor: 8, cursor: 9, observations: [] });
    expect(sink.connection).toHaveBeenLastCalledWith('reconnecting');
    expect(old.closed).toBe(true);
    adapter.stop();
    old.send('snapshot', boot);
    expect(sink.snapshot).toHaveBeenCalledTimes(1);
  });
  it('ticks a quiet stream, detects lost heartbeat, and resets state after a restart without replay traffic', () => {
    vi.useFakeTimers();
    const { adapter, streams, sink } = setup();
    streams[0]!.send('snapshot', boot);
    vi.advanceTimersByTime(10000);
    expect(sink.tick).toHaveBeenCalled();
    streams[0]!.send('heartbeat', { version: 1, epoch: 'server-1', cursor: 0 });
    vi.advanceTimersByTime(10000);
    expect(sink.connection).toHaveBeenLastCalledWith('connected');
    vi.advanceTimersByTime(31000);
    expect(sink.connection).toHaveBeenLastCalledWith('reconnecting');
    vi.advanceTimersByTime(2000);
    streams.at(-1)!.send('snapshot', { ...boot, epoch: 'server-2' });
    expect(sink.reset).toHaveBeenCalledTimes(2);
    expect(sink.events).not.toHaveBeenCalled();
    adapter.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
