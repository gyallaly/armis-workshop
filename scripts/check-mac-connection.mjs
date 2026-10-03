import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loopbackFetch } from './loopback-fetch.mjs';

/** Automated, read-only check of the existing Mac viewer protocol. */
export async function checkMacConnection(fetcher = loopbackFetch, origin = 'http://127.0.0.1:4173') {
  const endpoint = new URL(origin);
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.pathname !== '/' || endpoint.search || endpoint.username || endpoint.password) throw Error('Expected loopback viewer origin');
  const base = endpoint.origin;
  const report = { checkedAt: Date.now(), working: false, health: null, snapshots: 0, observations: 0, heartbeats: 0, error: null };
  try {
    const page = await fetcher(base + '/', { headers: { 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' }, signal: AbortSignal.timeout(5000) });
    if (!page.ok) throw Error(`Viewer document HTTP ${page.status}`);
    const cookie = page.headers.get('set-cookie')?.split(';')[0];
    await page.body?.cancel();
    if (!cookie?.startsWith('armis_viewer=')) throw Error('Viewer authentication cookie unavailable');
    const options = { headers: { Cookie: cookie, Origin: base }, signal: AbortSignal.timeout(6000) };
    const health = await fetcher(base + '/api/health', options);
    if (!health.ok) throw Error(`Health HTTP ${health.status}`);
    const h = await health.json();
    if (h.version !== 1 || h.state !== 'connected') throw Error('Viewer source is disconnected or incompatible');
    report.health = { version: h.version, state: h.state, source: h.source, revision: h.build?.revision ?? null };
    const response = await fetcher(base + '/api/events', { ...options, signal: AbortSignal.timeout(6000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw Error('SSE unavailable');
    const reader = response.body.getReader();
    let buffer = '', epoch = null, cursor = null;
    const decoder = new TextDecoder();
    try {
      while (!report.heartbeats) {
        const part = await reader.read();
        if (part.done) throw Error('Stream ended before its heartbeat');
        buffer += decoder.decode(part.value, { stream: true }).replaceAll('\r\n', '\n');
        if (buffer.length > 16 * 1024 * 1024) throw Error('Stream exceeds bounded frame size');
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const kind = frame.split('\n').find(l => l.startsWith('event:'))?.slice(6).trim();
          const lines = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart());
          if (!lines.length) continue;
          const data = JSON.parse(lines.join('\n'));
          if (data.version !== 1 || typeof data.epoch !== 'string' || !Number.isSafeInteger(data.cursor) || data.cursor < 0) throw Error('Invalid stream envelope');
          if (kind === 'snapshot') {
            if (data.mode !== 'live' || !Array.isArray(data.observations)) throw Error('Invalid live snapshot');
            epoch = data.epoch; cursor = data.cursor;
            report.snapshots++; report.observations += data.observations.length;
          } else {
            if (epoch === null || data.epoch !== epoch) throw Error('Snapshot missing or stream epoch changed');
            if (kind === 'heartbeat') {
              if (data.cursor !== cursor) throw Error('Heartbeat cursor mismatch');
              report.heartbeats++;
            } else if (kind === 'events') {
              if (data.previousCursor !== cursor || !Array.isArray(data.observations) || data.cursor <= cursor) throw Error('Event cursor gap');
              cursor = data.cursor; report.observations += data.observations.length;
            } else throw Error('Unsupported stream frame');
          }
        }
      }
    } finally { await reader.cancel(); }
    report.working = report.snapshots > 0 && report.heartbeats > 0;
  } catch (error) { report.error = error instanceof Error && error.name === 'TimeoutError' ? 'Viewer response or stream heartbeat timed out' : error instanceof Error ? error.message : 'Connection check failed'; }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkMacConnection();
  await mkdir('.armis', { recursive: true });
  await writeFile('.armis/connection-readiness.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.working ? 0 : 1;
}
