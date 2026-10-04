import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loopbackFetch } from './loopback-fetch.mjs';
import { EXECUTION_PATHS } from '../server/owner-policy.mjs';

export const GATE_PATHS = EXECUTION_PATHS;
export const ACCEPTANCE = Object.freeze([
  ['semantic-replay','Identical observations produce identical semantic state independent of frame rate.'],
  ['source-loss','Source loss never becomes fake lounge occupancy, full reactors or confirmed stopped status.'],
  ['command-idempotence','Duplicate commands are idempotent and conflicting revisions cannot overwrite newer policy.'],
  ['atomic-reservations','Concurrent sibling work cannot over-reserve shared company/provider budgets.'],
  ['company-shutdown','Shutdown fences attempts, nested calls, schedules and retries; reconciles cancellations/residual usage and isolates companies.'],
  ['restart-durability','Restart preserves limits, stopped state, commands and outcomes; browser disconnect does not release holds.'],
  ['installed-gates','Every installed request path is listed and independently checked; unsupported controls stay disabled.'],
  ['quota-evidence','Unknown/stale totals, multiple windows, resets, exhaustion, fallback and shared-pool double counting are checked.'],
  ['chat-integrity','Duplicates, stream interruption, reconnect, recipient identity, cancellation and linked action receipts are checked.'],
  ['deployment-rollback','Build/domain checks and installed config/schema/service/protocol/source/control checks support rollback.'],
  ['visual-accessibility','Geometry, occlusion, camera/minimap, interiors, labels, controls, keyboard and reduced motion cover required viewports.'],
]);
export const FEED_IDS = Object.freeze(['runtime','organization','workers','sessions','jobs','progress','handoffs','tools','quality','artifacts','capacity','usage','budgets','machine','scheduler','locks','integrations','schedules','approvals','results','deployment','incidents','ledger']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const command = (root, cmd, args, timeout=180000) => execFileSync(cmd,args,{cwd:root,encoding:'utf8',timeout,stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024}).trim();

/** Content fingerprint, not a claim that a Git revision contains dirty changes. Never reads credentials. */
export function treeHash(root, kind = 'source') {
  const entries=[];
  const walk=(dir,prefix)=>{
    if(!existsSync(dir))return;
    for(const name of readdirSync(dir).sort()) {
      if(name.startsWith('.')||['node_modules','coverage','test-results','playwright-report'].includes(name))continue;
      const path=join(dir,name), relative=prefix+name, stat=lstatSync(path);
      if(kind==='assets'&&relative==='dist/build-info.json')continue;
      if(stat.isSymbolicLink())throw Error('Fingerprint refuses symbolic links');
      if(stat.isDirectory())walk(path,relative+'/');
      else if(stat.isFile())entries.push([relative,hash(readFileSync(path))]);
    }
  };
  if(kind==='build'||kind==='assets')walk(join(root,'dist'),'dist/');
  else {
    for(const dir of ['src','server','scripts','tests','e2e','public'])walk(join(root,dir),dir+'/');
    for(const name of ['index.html','package.json','package-lock.json','tsconfig.json','vite.config.ts','vitest.config.ts','playwright.config.ts'])if(existsSync(join(root,name)))entries.push([name,hash(readFileSync(join(root,name)))]);
  }
  if(!entries.length)throw Error('Fingerprint input is empty');
  return hash(JSON.stringify(entries.sort((a,b)=>a[0].localeCompare(b[0]))));
}
export function buildIdentity(root) {
  const stamp=JSON.parse(readFileSync(join(root,'dist/build-info.json'),'utf8'));
  if(!/^[a-f0-9]{40}$/.test(stamp.revision)||typeof stamp.branch!=='string'||typeof stamp.dirty!=='boolean'||!Number.isFinite(stamp.builtAt))throw Error('Missing or invalid build stamp');
  if(!existsSync(join(root,'dist/index.html')))throw Error('Missing built viewer');
  if(stamp.version!==2||!Number.isSafeInteger(stamp.builtAt)||stamp.builtAt<0||!/^([a-f0-9]{64})$/.test(stamp.sourceHash)||!/^([a-f0-9]{64})$/.test(stamp.assetHash))throw Error('Missing measured build identity provenance');
  if(treeHash(root)!==stamp.sourceHash)throw Error('Build source identity changed since build');
  if(treeHash(root,'assets')!==stamp.assetHash)throw Error('Build asset identity changed since build');
  return {version:2,revision:stamp.revision,branch:stamp.branch,dirty:stamp.dirty,builtAt:stamp.builtAt,buildHash:treeHash(root,'build'),sourceHash:stamp.sourceHash,assetHash:stamp.assetHash};
}
export function loopbackOrigin(value) {
  const url=new URL(value);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Expected credential-free loopback HTTP origin');
  return url.origin;
}
async function jsonResponse(response) {
  if(!response.ok)throw Error('Readiness endpoint unavailable');
  const text=await response.text();if(text.length>2*1024*1024)throw Error('Readiness response exceeds bound');
  return JSON.parse(text);
}
export function summarizeFeeds(raw, now=Date.now()) {
  if(!Array.isArray(raw)||raw.length>FEED_IDS.length)throw Error('Invalid source inventory');
  const ids=new Set();
  for(const report of raw) {
    if(!FEED_IDS.includes(report?.id)||ids.has(report.id)||!['ok','error','not_configured','missing_access','unsupported','stale','not_applicable','blocked','partial'].includes(report.status)||!Number.isFinite(report.checkedAt)||report.checkedAt<0||report.checkedAt>now+30000||!Number.isSafeInteger(report.records)||report.records<0)throw Error('Invalid source inventory');
    ids.add(report.id);
  }
  return FEED_IDS.map(id=>{
    const r=raw.find(r=>r.id===id);
    return {id,status:!r?'unobserved':now-r.checkedAt>45000?'stale':r.status,checkedAt:r?.checkedAt??null,records:r?.records??null};
  });
}
export async function checkReadiness({origin='http://127.0.0.1:4173', expectedRevision, expectedSourceHash, expectedBuildHash, fetcher=loopbackFetch, timeoutMs=20000}={}) {
  const base=loopbackOrigin(origin);
  const result={version:1,checkedAt:Date.now(),transportReady:false,viewerReady:false,businessReady:false,uditusExecution:'paused',uditusSending:'paused',build:null,sources:[],capabilities:{},gateCoverage:GATE_PATHS.map(path=>({path,status:'unverified'})),acceptance:ACCEPTANCE.map(([id,requirement])=>({id,requirement,status:'unverified',evidence:[]})),gaps:[]};
  const deadline=AbortSignal.timeout(timeoutMs);
  const get=(path,headers={})=>fetcher(base+path,{headers,signal:deadline});
  try {
    const anonymous=await get('/api/health');await anonymous.body?.cancel();
    if(anonymous.status!==401)throw Error('Anonymous API must be denied');
    const page=await get('/',{'Sec-Fetch-Site':'none','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'});
    const setCookie=page.headers.get('set-cookie');await page.body?.cancel();
    if(!page.ok||!setCookie||!/^armis_viewer=[A-Za-z0-9]+;/.test(setCookie)||!setCookie.includes('HttpOnly')||!setCookie.includes('SameSite=Strict'))throw Error('Navigation authentication failed');
    const headers={Cookie:setCookie.split(';')[0],Origin:base};
    const denied=await get('/api/health',{...headers,Origin:'http://invalid.example'});await denied.body?.cancel();
    if(denied.status!==403)throw Error('Foreign origin must be denied');
    const h=await jsonResponse(await get('/api/health',headers));
    if(h.version!==1||h.state!=='connected'||!['armis-journal','hermes-metadata'].includes(h.source)||!h.build||!/^[a-f0-9]{40}$/.test(h.build.revision)||expectedRevision&&h.build.revision!==expectedRevision)throw Error('Connected stamped viewer revision not verified');
    for(const [key,expected] of [['sourceHash',expectedSourceHash],['buildHash',expectedBuildHash]]){
      if(expected!==undefined&&(!/^[a-f0-9]{64}$/.test(expected)||h.build[key]!==expected))throw Error('Served exact fingerprint not verified');
      if(h.build[key]!==undefined&&!/^[a-f0-9]{64}$/.test(h.build[key]))throw Error('Invalid served fingerprint');
    }
    result.build={revision:h.build.revision,sourceHash:h.build.sourceHash??null,buildHash:h.build.buildHash??null};
    const control=await jsonResponse(await get('/api/control',headers));
    if(control.version!==2||!control.capabilities||!control.coverage)throw Error('Owner control contract unavailable');
    for(const name of ['chat','companyControl','allocations'])result.capabilities[name]=control.capabilities[name]===true;
    // A supported chat-only surface does not imply global company-control coverage.
    result.chatReadiness={status:result.capabilities.chat?'advertised-unexercised':'unsupported',scope:'owner-chat-only',executionTested:false};
    if(result.capabilities.companyControl||result.capabilities.allocations) {
      result.gaps.push('Global company/allocation controls advertised enabled; independent installed acceptance is required before activation.');
      throw Error('Global control activation not independently accepted');
    }
    const evidence=await jsonResponse(await get('/api/evidence',headers));
    result.sources=summarizeFeeds(evidence.reports);
    const response=await get('/api/events',headers);
    if(!response.ok||!response.headers.get('content-type')?.includes('text/event-stream')||!response.body)throw Error('Live SSE unavailable');
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',epoch=null,cursor=null,heartbeat=false;
    try {
      while(!heartbeat) {
        const part=await reader.read();if(part.done)throw Error('SSE ended before coherent heartbeat');
        buffer+=decoder.decode(part.value,{stream:true}).replaceAll('\r\n','\n');if(buffer.length>16*1024*1024)throw Error('SSE frame exceeds bound');
        let boundary;
        while((boundary=buffer.indexOf('\n\n'))>=0) {
          const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
          const kind=frame.split('\n').find(l=>l.startsWith('event:'))?.slice(6).trim();
          const lines=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart());if(!lines.length)continue;
          const v=JSON.parse(lines.join('\n'));
          if(v.version!==1||typeof v.epoch!=='string'||!Number.isSafeInteger(v.cursor)||v.cursor<0)throw Error('Invalid SSE envelope');
          if(kind==='snapshot') {if(v.mode!=='live'||!Array.isArray(v.observations))throw Error('Invalid snapshot');epoch=v.epoch;cursor=v.cursor;}
          else {
            if(epoch===null||v.epoch!==epoch)throw Error('Missing snapshot or changed epoch');
            if(kind==='events') {if(v.previousCursor!==cursor||v.cursor<=cursor||!Array.isArray(v.observations))throw Error('SSE cursor gap');cursor=v.cursor;}
            else if(kind==='heartbeat') {if(v.cursor!==cursor)throw Error('Heartbeat cursor mismatch');heartbeat=true;}
            else if(kind==='current-work') {if(v.cursor!==cursor||!v.currentWork||typeof v.currentWork!=='object')throw Error('Invalid current-work envelope');}
            else throw Error('Unsupported SSE frame');
          }
        }
      }
    } finally {await reader.cancel();}
    result.transportReady=true;result.viewerReady=true;
  } catch {result.gaps.push('Viewer authentication, revision, source, control or bounded SSE check failed; inspect local tests/config without exposing credentials.');}
  result.gaps.push(`All ${GATE_PATHS.length} installed execution paths remain independently unverified by this observer; chat-only availability is distinct from global company/allocation control readiness.`,'Provider entitlements, live cancellation and business release acceptance are unverified. Uditus execution and sending remain paused by authorization; this checker does not assert or alter live kill-switch state.');
  return result;
}
export function savePrivate(path,value) {
  mkdirSync(resolve(path,'..'),{recursive:true,mode:0o700});
  writeFileSync(path,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
}
/** Explicit parent-only local build/test runner. Does not touch services or execute business work. */
export function isolatedPlaywrightConfig(root, directory, port) {
  if(!Number.isInteger(port)||port<1024||port>65535||port===4173)throw Error('Candidate tests require an isolated non-service port');
  const origin=`http://127.0.0.1:${port}`;
  const vite=join(root,'node_modules/vite/bin/vite.js');
  const command=[process.execPath,vite,'preview','--outDir',join(root,'dist'),'--host','127.0.0.1','--port',String(port),'--strictPort'].map(v=>JSON.stringify(v)).join(' ');
  return `import base from ${JSON.stringify(pathToFileURL(join(root,'playwright.config.ts')).href)};\nconst channel=process.env.PW_CHANNEL??'chromium';\nexport default {...base,testDir:${JSON.stringify(join(root,'e2e'))},outputDir:${JSON.stringify(join(directory,'results'))},use:{...base.use,baseURL:${JSON.stringify(origin)},channel:channel==='chromium'?undefined:channel},webServer:{command:${JSON.stringify(command)},cwd:${JSON.stringify(root)},url:${JSON.stringify(origin)},reuseExistingServer:false,timeout:60000}};\n`;
}
async function isolatedPort() {
  const server=createServer();
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  const port=server.address().port;
  await new Promise((ok,fail)=>server.close(error=>error?fail(error):ok()));
  if(port===4173)return isolatedPort();
  return port;
}
export async function runCandidateE2E(root) {
  const scratch=process.env.TMPDIR;
  if(!scratch||!scratch.startsWith('/')||resolve(scratch)===resolve(root)||resolve(scratch).startsWith(resolve(root)+'/'))throw Error('External TMPDIR required for candidate verification');
  const directory=mkdtempSync(join(scratch,'city-v2-readiness-'));
  const port=await isolatedPort(),config=join(directory,'playwright.config.mjs'),log=join(directory,'execution.log');
  writeFileSync(config,isolatedPlaywrightConfig(root,directory,port),{mode:0o600,flag:'wx'});
  const startedAt=Date.now();
  try {
    const output=command(root,process.execPath,[join(root,'node_modules/@playwright/test/cli.js'),'test','--config',config],600000);
    writeFileSync(log,output,{mode:0o600,flag:'wx'});
    return {name:'e2e',status:'passed',startedAt,finishedAt:Date.now(),candidateOrigin:`http://127.0.0.1:${port}`,config,log};
  } catch(error) {
    writeFileSync(log,String(error.stdout??'')+'\n'+String(error.stderr??''),{mode:0o600,flag:'wx'});
    return {name:'e2e',status:'failed',startedAt,finishedAt:Date.now(),candidateOrigin:`http://127.0.0.1:${port}`,config,log};
  }
}
export async function verifyRelease(root) {
  const before=treeHash(root),revision=command(root,'git',['rev-parse','HEAD']);
  const tests=[];
  const steps=[['typecheck',['run','typecheck']],['domain',['test','--','--maxWorkers=2','--testTimeout=60000']],['runtime-and-readiness',null],['build',['run','build']],['e2e',['run','test:e2e']]];
  for(const [name,args] of steps) {
    const startedAt=Date.now();
    try {
      if(name==='e2e') {
        const result=await runCandidateE2E(root);tests.push(result);
        if(result.status!=='passed')break;
        continue;
      }
      if(args)command(root,'npm',args);
      else command(root,process.execPath,['--test',...readdirSync(join(root,'scripts')).filter(n=>n.endsWith('.test.mjs')).sort().map(n=>'scripts/'+n)]);
      tests.push({name,status:'passed',startedAt,finishedAt:Date.now()});
    } catch {tests.push({name,status:'failed',startedAt,finishedAt:Date.now()});break;}
  }
  const after=treeHash(root);
  let identity=null;
  try {identity=buildIdentity(root);}catch { /* Failed builds produce a failed receipt, not invented identity. */ }
  return {version:1,checkedAt:Date.now(),...identity,revision,tests,passed:before===after&&identity?.revision===revision&&tests.length===steps.length&&tests.every(t=>t.status==='passed'),buildGeneratedByVerifier:tests.some(t=>t.name==='build'&&t.status==='passed')};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2),allowed=['--verify','--output','--origin','--expected-revision','--expected-source-hash','--expected-build-hash'];
  for(let i=0;i<args.length;i++){if(!allowed.includes(args[i]))throw Error('Unknown readiness argument');if(args[i]!=='--verify')i++;}
  const value=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
  const result=args.includes('--verify')?await verifyRelease(process.cwd()):await checkReadiness({origin:value('--origin'),expectedRevision:value('--expected-revision'),expectedSourceHash:value('--expected-source-hash'),expectedBuildHash:value('--expected-build-hash')});
  if(value('--output'))savePrivate(resolve(value('--output')),result);
  console.log(JSON.stringify(result,null,2));process.exitCode=(result.passed??result.viewerReady)?0:1;
}
