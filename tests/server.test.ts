import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function journal(path: string) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE viewer_events(cursor INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT UNIQUE NOT NULL,body TEXT NOT NULL)');
  return db;
}
function observed(seq: number, extra: Record<string, unknown> = {}) {
  return { version: 1, eventId: `store:${seq}`, source: 'store', sourceSequence: seq, type: 'attempt.finished',
    mode: 'live', provenance: 'observed', occurredAt: seq, receivedAt: seq,
    businessId: 'uditus', workerId: null, mandateId: null, taskId: 'task:1', attemptId: null, sessionId: null,
    data: { state: 'ready', evidencePresent: true }, ...extra };
}
function append(db: DatabaseSync, seq: number, extra: Record<string, unknown> = {}) {
  const body = observed(seq, extra);
  db.prepare('INSERT INTO viewer_events(event_id,body) VALUES(?,?)').run(body.eventId, JSON.stringify(body));
}
function sse(port: number, cookie: string, lastEventId?: string) {
  const frames: { name: string; id: string; data: any }[] = [];
  const req = request({ host: '127.0.0.1', port, path: '/api/events', headers: { Cookie: cookie, ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}) } });
  let error: Error | undefined;
  req.on('error', e => { if (!req.destroyed) error = e; });
  req.on('response', res => {
    res.setEncoding('utf8');
    let pending = '';
    res.on('error', () => {});
    res.on('data', chunk => {
      pending += chunk;
      let end: number;
      while ((end = pending.indexOf('\n\n')) !== -1) {
        const lines = pending.slice(0, end).split('\n'); pending = pending.slice(end + 2);
        const field = (name: string) => lines.find(l => l.startsWith(name + ': '))?.slice(name.length + 2) ?? '';
        if (field('data')) frames.push({ name: field('event'), id: field('id'), data: JSON.parse(field('data')) });
      }
    });
  });
  req.end();
  return { frames, close: () => req.destroy(), async next(index = 0) {
    const deadline = Date.now() + 3000;
    while (frames.length <= index && Date.now() < deadline) {
      if (error) throw error;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (!frames[index]) throw Error('SSE frame deadline');
    return frames[index]!;
  } };
}
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { request, type Server } from 'node:http';
import { createViewerServer } from '../server/index';

let dir: string;
const servers: Server[] = [];
beforeEach(() => {
  dir = mkdtempSync(join(process.env.TMPDIR!, 'viewer-test-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>viewer</title>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("built")');
});
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))));
  rmSync(dir, { recursive: true, force: true });
});
it('additional evidence endpoint remains same-origin authenticated and reports absent sources without inventing data',async()=>{
 const {port}=await start();
 expect((await get(port,'/api/evidence')).status).toBe(401);
 const cookie=await session(port);
 const response=await get(port,'/api/evidence',{Cookie:cookie});
 expect(response.status).toBe(200);
 expect(JSON.parse(response.body)).toMatchObject({setup:{state:'unavailable'},uditus:{state:'unavailable'}});
 expect((await get(port,'/api/evidence',{Cookie:cookie,Origin:'https://foreign.example'})).status).toBe(403);
 expect((await get(port,'/api/evidence',{Cookie:cookie},'POST')).status).toBe(405);
});
async function start(dbPath?: string) {
  const server = createViewerServer({ dist: dir, dbPath, port: 0 });
  servers.push(server);
  if (!server.listening) await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Expected TCP listener');
  expect(address.address).toBe('127.0.0.1');
  const port = address.port;
  return { server, port, origin: `http://127.0.0.1:${port}` };
}
function get(port: number, path: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}
async function session(port: number) {
  const root = await get(port, '/', { 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' });
  expect(root.status).toBe(200);
  return root.headers['set-cookie']![0]!.split(';')[0]!;
}

describe('local read-only viewer HTTP', () => {
  it('runs the dependency-free CLI on an ephemeral loopback port and exits cleanly on SIGTERM', async () => {
    const child = spawn(process.execPath, [resolve('server/cli.ts'), dir], { env: { ...process.env, PORT: '0', ARMIS_VIEWER_DB: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '';
    child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => errors += chunk);
    const exit = once(child, 'exit');
    try {
      const deadline = Date.now() + 3000;
      while (!output.match(/127\.0\.0\.1:(\d+)/) && child.exitCode === null && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
      expect(errors).toBe('');
      const match = output.match(/127\.0\.0\.1:(\d+)/);
      expect(match).not.toBeNull();
      const port = Number(match![1]);
      const cookie = await session(port);
      expect(JSON.parse((await get(port, '/api/health', { Cookie: cookie })).body).state).toBe('disconnected');
    } finally { child.kill('SIGTERM'); await exit; }
    expect(child.exitCode).toBe(0);
  });

  it('accepts ordinary hyphenated machine task IDs without treating task- as a credential prefix', async () => {
    const path = join(dir, 'journal.sqlite'), db = journal(path);
    append(db, 1, { taskId: 'task-01', sessionId: 'session-01' }); db.close();
    const { port } = await start(path), stream = sse(port, await session(port));
    try { expect((await stream.next()).data.observations[0].taskId).toBe('task-01'); } finally { stream.close(); }
  });

  it('does not skip the second batch when an initially empty journal gets more than 500 rows', async () => {
    const path = join(dir, 'journal.sqlite'), db = journal(path);
    try {
      const { port } = await start(path), stream = sse(port, await session(port));
      try {
        expect((await stream.next()).data.cursor).toBe(0);
        db.exec('BEGIN'); for (let n = 1; n <= 501; n++) append(db, n); db.exec('COMMIT');
        const first = await stream.next(1), second = await stream.next(2);
        expect(first.data.cursor).toBe(500);
        expect(second.data.previousCursor).toBe(500);
        expect(second.data.cursor).toBe(501);
      } finally { stream.close(); }
    } finally { db.close(); }
  });

  it('uses incarnation-specific epochs on restart, never resumes old history, and never writes the DB', async () => {
    const path = join(dir, 'journal.sqlite'), writer = journal(path);
    append(writer, 1); writer.close();
    const before = readFileSync(path);
    const one = await start(path), oldCookie = await session(one.port), stream = sse(one.port, oldCookie);
    const old = await stream.next(); stream.close();
    await new Promise<void>((resolve, reject) => one.server.close(e => e ? reject(e) : resolve()));
    servers.splice(servers.indexOf(one.server), 1);
    const two = await start(path), newCookie = await session(two.port), again = sse(two.port, newCookie, old.id);
    try {
      const current = await again.next();
      expect(current.name).toBe('snapshot');
      expect(current.data.epoch).not.toBe(old.data.epoch);
      expect(current.data.cursor).toBe(old.data.cursor);
      expect((await get(two.port, '/api/health', { Cookie: oldCookie })).status).toBe(401);
      const heartbeat = await again.next(1);
      expect(heartbeat).toEqual({ name: 'heartbeat', id: current.id, data: { version: 1, epoch: current.data.epoch, cursor: 1 } });
      expect(readFileSync(path)).toEqual(before);
      const readonly = new DatabaseSync(path, { readOnly: true });
      expect(readonly.prepare('SELECT count(*) n FROM viewer_events').get()!.n).toBe(1);
      readonly.close();
    } finally { again.close(); }
  });

  it('fails closed on oversized journals and on corruption added while streaming', async () => {
    const path = join(dir, 'journal.sqlite'), db = journal(path);
    try {
      const { port } = await start(path), cookie = await session(port), stream = sse(port, cookie);
      try {
        await stream.next();
        append(db, 1, { taskId: 'sk-secret' });
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(JSON.parse((await get(port, '/api/health', { Cookie: cookie })).body).state).toBe('disconnected');
        expect((await get(port, '/api/events', { Cookie: cookie })).status).toBe(503);
      } finally { stream.close(); }
      db.exec('DELETE FROM viewer_events; BEGIN');
      for (let n = 1; n <= 10001; n++) append(db, n);
      db.exec('COMMIT');
      const other = await start(path), auth = { Cookie: await session(other.port) };
      expect((await get(other.port, '/api/events', auth)).status).toBe(503);
    } finally { db.close(); }
  });

  it('closes stalled consumers after bounded backpressure without polling into an unbounded queue', async () => {
    const path = join(dir, 'journal.sqlite'), db = journal(path);
    db.exec('BEGIN');
    const metadata = { requestedModel: 'm'.repeat(120), actualModel: 'm'.repeat(120), provider: 'p'.repeat(120), capacityPoolId: 'c'.repeat(120), artifactId: 'a'.repeat(120) };
    for (let n = 1; n <= 9000; n++) append(db, n, { data: metadata });
    db.exec('COMMIT'); db.close();
    const { server, port } = await start(path), cookie = await session(port);
    let response: import('node:http').IncomingMessage | undefined;
    const req = request({ host: '127.0.0.1', port, path: '/api/events', headers: { Cookie: cookie } }, res => { response = res; res.pause(); res.on('error', () => {}); });
    req.on('error', () => {}); req.end();
    try {
      await new Promise(resolve => setTimeout(resolve, 1800));
      const count = await new Promise<number>((resolve, reject) => server.getConnections((e, n) => e ? reject(e) : resolve(n)));
      expect(count).toBe(0);
    } finally { response?.destroy(); req.destroy(); }
  });

  it('projects only actual numeric/model/provider metadata and evidence presence, excluding raw secrets and fabricated fields', async () => {
    const path = join(dir, 'journal.sqlite'), db = journal(path);
    const data = { state: 'ready', evidencePresent: true, actualModel: 'gpt-6.1', requestedModel: 'gpt-6.1', provider: 'openai', capacityPoolId: 'pool:1',
      inputTokens: 3, outputTokens: null, cacheTokens: 2, costMicros: 4, costProvenance: 'observed', quotaUnits: null, quotaProvenance: 'unknown',
      remaining: 10, total: 20, resetAt: 30, observedAt: 1, maxAgeMs: 60000, round: 2, evidenceCount: 1, unit: 'tokens', waitReason: 'capacity',
      artifactId: 'artifact:1', reviewerId: 'uditus.reviewer', parentMandateId: null, senderId: 'owner', recipientId: 'uditus.ceo',
      evidence: { present: true, contentExposed: false }, stopped: false, action: 'retry' };
    append(db, 1, { prompt: 'PRIVATE_PROMPT', auth: 'sk-PRIVATE_SECRET', data: { ...data, acceptanceCount: 99, from: 'made-up', to: 'made-up', prompt: 'PRIVATE_PROMPT', evidenceText: 'PRIVATE_EVIDENCE', secret: 'sk-PRIVATE_SECRET' } });
    db.close();
    const { port } = await start(path), cookie = await session(port), stream = sse(port, cookie);
    try {
      const frame = await stream.next();
      expect(frame.data.observations[0].data).toEqual(data);
      expect(Object.keys(frame.data.observations[0]).sort()).toEqual(['version','eventId','cursor','source','type','occurredAt','mode','businessId','workerId','taskId','attemptId','sessionId','mandateId','data'].sort());
      expect(JSON.stringify(frame)).not.toMatch(/PRIVATE|acceptanceCount|made-up|receivedAt|sourceSequence/);
    } finally { stream.close(); }
  });

  it.each([
    { version: 2 }, { mode: 'demo' }, { type: 'task.invented' }, { source: 'https://evil.test' },
    { taskId: 'sk-live-SECRET01234567890' }, { sessionId: 'Bearer_secret' }, { eventId: 'ghp_SECRET01234567890' },
    { businessId: 'unknown' }, { workerId: 'invented.worker' }, { occurredAt: -1 }, { provenance: 'configured' },
    { data: { actualModel: 'sk-live-SECRET01234567890' } }, { data: { inputTokens: 1.5 } },
    { data: { state: 'accepted' } }, { data: { waitReason: 'private-reason' } }, { data: { evidence: { present: true, contentExposed: true } } },
  ])('fails closed for invalid source metadata %j', async extra => {
    const path = join(dir, 'journal.sqlite'), db = journal(path);
    append(db, 1, extra); db.close();
    const { port } = await start(path), cookie = await session(port);
    expect(JSON.parse((await get(port, '/api/health', { Cookie: cookie })).body).state).toBe('disconnected');
    expect((await get(port, '/api/events', { Cookie: cookie })).status).toBe(503);
  });

  it('reads a consistent snapshot, preserves durable cursor gaps, polls bounded chained batches and reconnects with snapshots', async () => {
    const path = join(dir, 'journal.sqlite');
    const db = journal(path);
    try {
      append(db, 1);
      db.prepare('INSERT OR IGNORE INTO viewer_events(event_id,body) VALUES(?,?)').run('store:1', '{}');
      append(db, 2);
      const { port } = await start(path);
      const cookie = await session(port);
      expect(JSON.parse((await get(port, '/api/health', { Cookie: cookie })).body).state).toBe('connected');
      const stream = sse(port, cookie);
      try {
        const initial = await stream.next();
        expect(initial.name).toBe('snapshot');
        expect(initial.data).toMatchObject({ version: 1, mode: 'live', cursor: 3 });
        expect(initial.data.observations.map((e: any) => e.cursor)).toEqual([1, 3]);
        expect(initial.id).toBe(initial.data.epoch + ':3');
        db.exec('BEGIN');
        for (let i = 3; i <= 503; i++) append(db, i);
        // Uncommitted records cannot appear in the stream or snapshot.
        const during = sse(port, cookie);
        try { expect((await during.next()).data.cursor).toBe(3); } finally { during.close(); }
        db.exec('COMMIT');
        let next = 1, cursor = 3, received = 0;
        while (received < 501) {
          const frame = await stream.next(next++);
          if (frame.name === 'heartbeat') continue;
          expect(frame.name).toBe('events');
          expect(frame.data.previousCursor).toBe(cursor);
          expect(frame.data.epoch).toBe(initial.data.epoch);
          expect(frame.data.observations.length).toBeLessThanOrEqual(500);
          cursor = frame.data.cursor;
          received += frame.data.observations.length;
        }
        expect(cursor).toBe(504);
        const again = sse(port, cookie, initial.id);
        try {
          const snapshot = await again.next();
          expect(snapshot.name).toBe('snapshot');
          expect(snapshot.data.cursor).toBe(504);
          expect(snapshot.data.observations).toHaveLength(503);
        } finally { again.close(); }
      } finally { stream.close(); }
    } finally { db.close(); }
  });

  it('requires a local session and rejects foreign authority, origins, fetch context, paths and methods', async () => {
    const { port, origin } = await start();
    expect((await get(port, '/api/health')).status).toBe(401);
    expect((await get(port, '/api/events')).status).toBe(401);
    expect((await get(port, '/')).headers['set-cookie']).toBeUndefined();
    const cookie = await session(port);
    const auth = { Cookie: cookie };
    for (const Host of ['localhost:' + port, '127.0.0.1', 'evil.test:' + port, '127.0.0.1:' + (port + 1)])
      expect((await get(port, '/api/health', { ...auth, Host })).status).toBe(403);
    for (const Origin of ['null', 'https://evil.test', 'http://localhost:' + port, origin + '/'])
      expect((await get(port, '/api/health', { ...auth, Origin })).status).toBe(403);
    expect((await get(port, '/api/health', { ...auth, Origin: origin })).status).toBe(200);
    expect((await get(port, '/api/health', { ...auth, 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await get(port, '/api/health', { Cookie: 'armis_viewer=bad' })).status).toBe(401);
    expect((await get(port, '/', { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' })).status).toBe(403);
    for (const method of ['POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'])
      expect((await get(port, '/api/health', auth, method)).status).toBe(405);
    for (const path of ['/api/events?token=bad', '/api/health?x=1', '/assets/../index.html', '/%2e%2e/secrets', '/assets/%2fetc/passwd', '/other', '//api/health'])
      expect((await get(port, path, auth)).status).toBe(404);
    expect((await get(port, '/api/health', auth)).headers['access-control-allow-origin']).toBeUndefined();
  });

  it('serves only startup allowlisted built assets and never hidden files or symlink escapes', async () => {
    writeFileSync(join(dir, 'secret.sqlite'), 'SECRET');
    writeFileSync(join(dir, 'assets', 'app.js.map'), 'SECRET');
    writeFileSync(join(dir, 'assets', '.hidden.js'), 'SECRET');
    const { port } = await start();
    const auth = { Cookie: await session(port) };
    expect((await get(port, '/assets/app.js', auth)).body).toBe('console.log("built")');
    writeFileSync(join(dir, 'assets', 'late.js'), 'SECRET');
    for (const path of ['/secret.sqlite', '/assets/app.js.map', '/assets/.hidden.js', '/assets/late.js'])
      expect((await get(port, path, auth)).status).toBe(404);
  });
  it('serves the built root, mints a private session, and stays disconnected without a DB', async () => {
    const { port } = await start();
    const root = await get(port, '/', { 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' });
    expect(root.status).toBe(200);
    expect(root.body).toContain('<title>viewer</title>');
    const setCookie = root.headers['set-cookie']![0]!;
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    const cookie = setCookie.split(';')[0]!;
    const health = await get(port, '/api/health', { Cookie: cookie });
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body)).toMatchObject({ version: 1, state: 'disconnected' });
    expect((await get(port, '/api/events', { Cookie: cookie })).status).toBe(503);
  });
});
