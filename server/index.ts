import { createServer, type Server } from 'node:http';
import { OwnerPolicy, HttpExecutor } from './owner-policy.mjs';
import { controlHandler } from './control-http.mjs';
import { DurableChat, HermesCliChat, chatHandler, type ChatTransport } from './chat.ts';
import { randomBytes } from 'node:crypto';
import { builtAssets } from './assets.ts';
import { Journal } from './journal.ts';
import { HermesMetadata } from './hermes.ts';
import { resourceObservation } from './resources.ts';
import { CurrentWork } from './current-work.ts';
import { readArmisStatus } from './armis.ts';
import { connectionReports, readMemoryStatus, readPolicyStatus } from './connections.ts';
import { SetupEvidence } from './evidence.ts';
import { bindUditus, type UditusSource } from './uditus.ts';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { buildIdentity } from '../scripts/city-v2-readiness.mjs';
import type { ServerResponse } from 'node:http';

export interface ViewerServerOptions { dist: string; dbPath?: string; hermesDbPath?: string; hermesSessionId?: string; uditusEnvPath?: string; port?: number; policyPath?: string; executorUrl?: string; executorToken?: string; gateToken?: string; currentWorkDbPath?:string;currentWorkScopePath?:string;currentWorkEnrollmentPath?:string;currentWorkEnrollmentRoot?:string;currentWorkChatId?:string;currentWorkThreadId?:string;armisStatusPath?:string;setupPolicyPath?:string;verifyExecutorEvidence?:(caps:unknown)=>unknown; chatStorePath?:string; hermesChatExecutable?:string; hermesChatCwd?:string; chatTransport?:ChatTransport }
/** Starts a loopback-only listener; await its listening event before use. */
export function createViewerServer(options: ViewerServerOptions): Server {
  const sessions = new Set<string>();
  const policy = new OwnerPolicy(options.policyPath ?? '.armis/owner-policy.json', options.executorUrl && options.executorToken ? new HttpExecutor(options.executorUrl,options.executorToken) : null,options.verifyExecutorEvidence);
  const controls = controlHandler(policy,options.gateToken);
  // A supported CLI does not prove owner-control coverage. DurableChat uses the
  // unchanged OwnerPolicy coverage gate before launching anything.
  const transport = options.chatTransport ?? (options.hermesChatExecutable && options.hermesChatCwd ? new HermesCliChat(options.hermesChatExecutable, options.hermesChatCwd) : policy.executor ? {
    run: async (request: Parameters<ChatTransport['run']>[0], sessionId: string|undefined, onSession: (id:string)=>void, signal:AbortSignal) => {
      if(signal.aborted)throw Error('Chat interrupted');
      const result=await policy.executor.chat({...request,sessionId});
      if(signal.aborted)throw Error('Remote interruption remains unconfirmed');
      if(result.sessionId)onSession(result.sessionId);
      return result;
    },
  } : null);
  const chat = new DurableChat(policy,transport,options.chatStorePath);
  const chats = chatHandler(chat);
  const assets = builtAssets(options.dist);
  if (options.dbPath && options.hermesDbPath) throw Error('Select one explicitly bound source');
  let journal: Journal | HermesMetadata | undefined;
  try {
    if (options.dbPath) journal = new Journal(options.dbPath);
    if (options.hermesDbPath && options.hermesSessionId) journal = new HermesMetadata(options.hermesDbPath, options.hermesSessionId);
  } catch { /* Fail closed: no source details in HTTP responses. */ }
  let evidence: SetupEvidence | undefined, uditus: UditusSource | undefined;
  let currentWork: CurrentWork | undefined, workerWork: CurrentWork | undefined;
  try {
    if(options.currentWorkEnrollmentPath||options.currentWorkEnrollmentRoot){
      if(!options.currentWorkDbPath||!options.currentWorkEnrollmentPath||!options.currentWorkEnrollmentRoot||options.currentWorkScopePath)throw Error('Select one complete explicit enrollment binding');
      workerWork=new CurrentWork(options.currentWorkDbPath,{enrollmentPath:options.currentWorkEnrollmentPath,enrollmentRoot:options.currentWorkEnrollmentRoot});
    }else if(options.currentWorkDbPath&&options.currentWorkScopePath){
      const raw=readFileSync(options.currentWorkScopePath,'utf8');
      if(raw.length>16384)throw Error('Worker scope exceeds bound');
      const scope=JSON.parse(raw);
      if(!scope||!Array.isArray(scope.sessionIds))throw Error('Explicit worker session allowlist required');
      workerWork=new CurrentWork(options.currentWorkDbPath,scope);
    }
    if(options.currentWorkDbPath&&options.currentWorkChatId&&options.currentWorkThreadId){
      currentWork=new CurrentWork(options.currentWorkDbPath,{chatId:options.currentWorkChatId,threadId:options.currentWorkThreadId});
    }
  } catch { /* Independent source fails closed. */ }
  const readWork=()=>{
    const now=Date.now();
    const read=(reader?:CurrentWork)=>{try{return reader?.read(now);}catch{return undefined;}};
    const director=read(currentWork),workers=read(workerWork);
    if(workers&&'sessions' in workers){
      const sessions=[...(director&&'sessionId' in director?[{...director,workerId:'armis.ceo'}]:[]),...workers.sessions];
      return {...workers,sessions,sessionCount:sessions.filter(s=>s.state==='connected').length,boundRoleCount:new Set(sessions.filter(s=>s.state==='connected'&&s.workerId).map(s=>s.workerId)).size};
    }
    return director??{state:'unavailable',gap:'Current-work source unreadable or unbound; execution unknown'};
  };
  try { if (options.dbPath) evidence = new SetupEvidence(options.dbPath); } catch { /* Optional source unavailable, never blocks HQ. */ }
  try { if (options.uditusEnvPath) uditus = bindUditus(options.uditusEnvPath); } catch { /* Explicit missing binding. */ }
  let build: Record<string, unknown> | null = null;
  try {
    build = buildIdentity(dirname(options.dist));
  } catch { /* Unstamped or unfingerprintable builds remain unverified. */ }
  const streams = new Map<ServerResponse, NodeJS.Timeout>();
  const disconnect = () => {
    for (const [res, timer] of streams) { clearInterval(timer); res.destroy(); }
    streams.clear();
    journal?.close(); journal = undefined;
  };
  const server = createServer(async (req, res) => {
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
    const path = req.url ?? '';
    const asset = assets.get(path);
    const cookies = (req.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith('armis_viewer='));
    const session = cookies.length === 1 ? cookies[0]!.slice('armis_viewer='.length) : '';
    const authenticated = sessions.has(session);
    try {if (await chats(req,res,authenticated,`http://${host}`)) return;if (await controls(req,res,authenticated,`http://${host}`)) return;} catch {return end(503);}
    if (req.method !== 'GET') { res.setHeader('Allow','GET'); return end(405); }
    if (!asset && !['/api/health','/api/events','/api/evidence','/api/resources','/api/current-work'].includes(path)) return end(404);
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
    if(path==='/api/resources') {res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(resourceObservation(options.dist)));}
    if(path==='/api/current-work') {res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(readWork()));}
    if (path === '/api/evidence') {
      let setup: object = {state:'unavailable',gap:'No explicitly bound setup evidence journal'};
      try { if (evidence) setup = evidence.read(); } catch { setup = {state:'unavailable',gap:'Bound setup evidence schema is unavailable'}; }
      res.setHeader('Content-Type','application/json');
      const complete = (business: object) => {
        if(res.destroyed)return;
        const now=Date.now(),armis=readArmisStatus(options.armisStatusPath);
        const diagnostic=(setup as {diagnostics?:{retrievals?:number;lastRetrievalAt?:number|null}}).diagnostics;
        const memory=readMemoryStatus(options.armisStatusPath?join(dirname(options.armisStatusPath),'outbox.db'):undefined,diagnostic?.retrievals,diagnostic?.lastRetrievalAt);
        const setupPolicy=readPolicyStatus(options.setupPolicyPath);
        const reports=connectionReports({build,setup,uditus:business,armis,memory,policy:setupPolicy,work:readWork(),now});
        const resources=resourceObservation(options.dist,now);
        const machine=reports.find(r=>r.id==='machine');
        if(machine)Object.assign(machine,{status:'ok',checkedAt:now,source:resources.source,detail:'Fresh host CPU times, load, memory, swap, disk and uptime measured. GPU and per-company attribution not reported.',records:1});
        res.end(JSON.stringify({build,setup,uditus:business,armis,operational:{memory,policy:setupPolicy},reports,resources,currentWork:readWork()}));
      };
      if (!uditus) complete({state:'unavailable',gap:'No authorized Uditus project environment bound'});
      else void uditus.read().then(complete,()=>complete({state:'unavailable',gap:'Uditus read failed'}));
      return;
    }
    let initial: ReturnType<Journal['read']> | undefined;
    try { initial = journal?.read(0, 10000, true); } catch { disconnect(); }
    if (path === '/api/health') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ version: 1, build, state: journal ? 'connected' : 'disconnected', source: journal instanceof HermesMetadata ? 'hermes-metadata' : journal ? 'armis-journal' : null, epoch: journal?.epoch ?? null, cursor: initial?.cursor ?? null }));
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
    send('snapshot', { version: 1, epoch, cursor, observations: initial.observations, currentWork:readWork(), mode: 'live' });
    let lastHeartbeat = Date.now();
    let lastWorkRead=Date.now();
    const workKey=(value:unknown)=>JSON.stringify(value,(key,v)=>key==='observedAt'?undefined:v);
    let lastWorkKey=workKey(readWork());
    const timer = setInterval(() => {
      try {
        if (res.destroyed) return;
        if (blockedAt !== undefined) {
          if (Date.now() - blockedAt >= 1000) res.destroy();
          return;
        }
        if (!journal) return res.destroy();
        if(Date.now()-lastWorkRead>=1000){lastWorkRead=Date.now();const work=readWork(),key=workKey(work);if(key!==lastWorkKey){lastWorkKey=key;send('current-work',{version:1,epoch,cursor,currentWork:work});}}
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
  server.close = ((callback?: (error?: Error) => void) => { disconnect(); evidence?.close(); evidence = undefined; currentWork?.close();workerWork?.close();sessions.clear(); void chat.close().then(()=>close(callback),()=>close(callback)); return server; }) as Server['close'];
  server.once('error', disconnect);
  server.listen(options.port ?? 0, '127.0.0.1');
  return server;
}
