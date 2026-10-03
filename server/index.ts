import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { builtAssets } from './assets.ts';
import { Journal } from './journal.ts';
import { HermesMetadata } from './hermes.ts';
import type { ServerResponse } from 'node:http';

export interface ViewerServerOptions { dist: string; dbPath?: string; hermesDbPath?: string; hermesSessionId?: string; port?: number }
/** Starts a loopback-only listener; await its listening event before use. */
export function createViewerServer(options: ViewerServerOptions): Server {
  const sessions = new Set<string>();
  const assets = builtAssets(options.dist);
  if (options.dbPath && options.hermesDbPath) throw Error('Select one explicitly bound source');
  let journal: Journal | HermesMetadata | undefined;
  try {
    if (options.dbPath) journal = new Journal(options.dbPath);
    if (options.hermesDbPath && options.hermesSessionId) journal = new HermesMetadata(options.hermesDbPath, options.hermesSessionId);
  } catch { /* Fail closed: no source details in HTTP responses. */ }
  const streams = new Map<ServerResponse, NodeJS.Timeout>();
  const disconnect = () => {
    for (const [res, timer] of streams) { clearInterval(timer); res.destroy(); }
    streams.clear();
    journal?.close(); journal = undefined;
  };
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    const end = (status: number) => { res.writeHead(status); res.end(); };
    const address = server.address();
    if (!address || typeof address === 'string') return end(503);
    const host = `127.0.0.1:${address.port}`;
    const countHeader = (name: string) => req.rawHeaders.filter((h, i) => i % 2 === 0 && h.toLowerCase() === name).length;
    if (countHeader('host') !== 1 || req.headers.host !== host ||
        (req.headers.origin !== undefined && (countHeader('origin') !== 1 || req.headers.origin !== `http://${host}`)) ||
        (req.headers['sec-fetch-site'] !== undefined && !['none', 'same-origin'].includes(String(req.headers['sec-fetch-site'])))) return end(403);
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return end(405); }
    const path = req.url ?? '';
    const asset = assets.get(path);
    if (!asset && path !== '/api/health' && path !== '/api/events') return end(404);
    const cookies = (req.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith('armis_viewer='));
    const session = cookies.length === 1 ? cookies[0]!.slice('armis_viewer='.length) : '';
    const authenticated = sessions.has(session);
    if (asset) {
      if (path === '/' && !authenticated &&
          ['none', 'same-origin'].includes(String(req.headers['sec-fetch-site'])) &&
          req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document') {
        const token = randomBytes(32).toString('hex');
        if (sessions.size >= 128) sessions.delete(sessions.values().next().value!);
        sessions.add(token);
        res.setHeader('Set-Cookie', `armis_viewer=${token}; HttpOnly; SameSite=Strict; Path=/`);
      }
      res.setHeader('Content-Type', asset.mime);
      return res.end(asset.body);
    }
    if (!authenticated) return end(401);
    let initial: ReturnType<Journal['read']> | undefined;
    try { initial = journal?.read(0, 10000, true); } catch { disconnect(); }
    if (path === '/api/health') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ version: 1, state: journal ? 'connected' : 'disconnected', source: journal instanceof HermesMetadata ? 'hermes-metadata' : journal ? 'armis-journal' : null, epoch: journal?.epoch ?? null, cursor: initial?.cursor ?? null }));
    }
    if (!journal || !initial || streams.size >= 16) return end(503);
    const epoch = journal.epoch;
    let cursor = initial.cursor, blockedAt: number | undefined;
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    const send = (name: string, payload: object) => {
      const frame = `event: ${name}\nid: ${epoch}:${cursor}\ndata: ${JSON.stringify(payload)}\n\n`;
      // At most one frame is buffered; no further reads/writes until drain.
      if (Buffer.byteLength(frame) > 16 * 1024 * 1024) { res.destroy(); return; }
      if (!res.write(frame)) blockedAt = Date.now();
    };
    res.on('drain', () => { blockedAt = undefined; });
    send('snapshot', { version: 1, epoch, cursor, observations: initial.observations, mode: 'live' });
    let lastHeartbeat = Date.now();
    const timer = setInterval(() => {
      try {
        if (res.destroyed) return;
        if (blockedAt !== undefined) {
          if (Date.now() - blockedAt >= 1000) res.destroy();
          return;
        }
        if (!journal) return res.destroy();
        const batch = journal.read(cursor, 500);
        if (batch.observations.length) {
          const previousCursor = cursor; cursor = batch.cursor;
          send('events', { version: 1, epoch, cursor, previousCursor, observations: batch.observations });
        } else if (Date.now() - lastHeartbeat >= 1000) {
          send('heartbeat', { version: 1, epoch, cursor }); lastHeartbeat = Date.now();
        }
      } catch { disconnect(); }
    }, 50);
    streams.set(res, timer);
    res.on('close', () => { clearInterval(timer); streams.delete(res); });
  });
  const close = server.close.bind(server);
  server.close = ((callback?: (error?: Error) => void) => { disconnect(); sessions.clear(); return close(callback); }) as Server['close'];
  server.once('error', disconnect);
  server.listen(options.port ?? 0, '127.0.0.1');
  return server;
}
