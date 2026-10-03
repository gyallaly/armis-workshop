import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMacConnection } from './check-mac-connection.mjs';
function fixture(frames, state = 'connected') {
  return async (url, options) => {
    if (url.endsWith('/api/health')) return Response.json({ version: 1, state, source: 'armis-journal' });
    if (url.endsWith('/api/events')) {
      assert.equal(options.headers.Cookie, 'armis_viewer=private');
      return new Response(frames, { headers: { 'content-type': 'text/event-stream' } });
    }
    return new Response('viewer', { headers: { 'set-cookie': 'armis_viewer=private; HttpOnly; SameSite=Strict' } });
  };
}
const frame = (kind, body) => `event: ${kind}\ndata: ${JSON.stringify({ version: 1, epoch: 'runtime', ...body })}\n\n`;
const snapshot = frame('snapshot', { mode: 'live', cursor: 244, observations: [] });
test('quiet live source passes with snapshot and matching heartbeat', async () => {
  const r = await checkMacConnection(fixture(snapshot + frame('heartbeat', { cursor: 244 })));
  assert.equal(r.working, true); assert.equal(r.heartbeats, 1); assert.equal(r.observations, 0);
  assert.ok(!JSON.stringify(r).includes('private'));
});
test('open stream does not pass without a snapshot or coherent cursor', async () => {
  for (const stream of [frame('heartbeat', { cursor: 244 }), snapshot + frame('heartbeat', { cursor: 245 }), snapshot + frame('events', { cursor: 246, previousCursor: 240, observations: [] })]) {
    const r = await checkMacConnection(fixture(stream)); assert.equal(r.working, false); assert.ok(r.error);
  }
});
test('disconnected source is red even when its HTTP server responds', async () => {
  const r = await checkMacConnection(fixture(snapshot, 'disconnected')); assert.equal(r.working, false);
});
