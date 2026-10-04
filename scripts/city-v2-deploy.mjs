import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, mkdirSync, renameSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildIdentity, checkReadiness, loopbackOrigin, savePrivate } from './city-v2-readiness.mjs';
import { recoveryIdentity, validateRecoveryIdentity, IDENTITY_KEYS, checkRecoveryReadiness } from './recovery-readiness.mjs';

export const SERVICE='armis-viewer.service';
export const DROPIN='zz-city-v2-switch.conf';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const safePath=path=>{if(!/^\/[A-Za-z0-9_./-]+$/.test(path)||path.includes('/../'))throw Error('Only absolute systemd-safe paths supported');return path;};
const systemctl=args=>execFileSync('systemctl',['--user',...args],{encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024}).trim();
const property=name=>systemctl(['show',SERVICE,'-p',name,'--value']);
function fileIdentity(path) {
  const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink())throw Error('Service configuration must be regular files');
  return {path,hash:digest(readFileSync(path)),mode:s.mode&0o777};
}
export function renderSwitch({root,node,policyPath}) {
  for(const value of [root,node,policyPath])safePath(value);
  return `[Service]\nWorkingDirectory=${root}\nExecStart=\nExecStart=${node} ${root}/server/cli.ts ${root}/dist\nEnvironment="ARMIS_OWNER_POLICY_PATH=${policyPath}"\n`;
}
export function renderRecoverySwitch({root,node,policyPath}) {
  return renderSwitch({root,node,policyPath});
}
export function verifyRecoveryBinding(plan,{active,root,exec,content}) {
  const expected=`${plan.node} ${plan.recoveryRoot}/server/cli.ts ${plan.recoveryRoot}/dist`;
  return active==='active'&&root===plan.recoveryRoot&&content===plan.recoveryContent&&(exec===expected||exec.includes(`argv[]=${expected} ;`));
}
function verifyRecovery(plan,adapter) {
  if(!plan.recoveryRoot||!plan.recoveryContent||!plan.recoveryOrigin)throw Error('Explicit measured recovery binding required');
  safePath(plan.recoveryRoot);loopbackOrigin(plan.recoveryOrigin);validateRecoveryIdentity(plan.recoveryIdentity);
  const current=adapter.recoveryIdentity?adapter.recoveryIdentity(plan):recoveryIdentity(plan.recoveryRoot);
  if(IDENTITY_KEYS.some(key=>current[key]!==plan.recoveryIdentity[key]))throw Error('Recovery identity changed since verification');
  const content=adapter.recoveryConfig?adapter.recoveryConfig(plan):renderRecoverySwitch({root:plan.recoveryRoot,node:plan.node,policyPath:plan.policyPath});
  if(content!==plan.recoveryContent)throw Error('Recovery configuration changed since verification');
}
export function validateReceipt(receipt, identity, now=Date.now()) {
  const names=['typecheck','domain','runtime-and-readiness','build','e2e'];
  if(receipt?.version!==1||receipt.passed!==true||receipt.buildGeneratedByVerifier!==true||!Number.isFinite(receipt.checkedAt)||receipt.checkedAt>now||now-receipt.checkedAt>24*3600000||receipt.revision!==identity.revision||receipt.sourceHash!==identity.sourceHash||receipt.buildHash!==identity.buildHash||!Array.isArray(receipt.tests)||receipt.tests.length!==names.length||names.some((name,i)=>receipt.tests[i]?.name!==name||receipt.tests[i]?.status!=='passed'))throw Error('Current exact-source/build passing verification receipt required');
  const candidate=loopbackOrigin(receipt.tests.at(-1).candidateOrigin);
  if(new URL(candidate).port==='4173')throw Error('E2E must verify isolated candidate, not operational viewer');
}
export function discover(root, {home=homedir(),recoveryRoot,recoveryOrigin}={}) {
  if(process.platform!=='linux')throw Error('Only Linux user-service activation supported');
  root=safePath(resolve(root));
  const unit=safePath(join(home,'.config/systemd/user',SERVICE));
  if(property('FragmentPath')!==unit)throw Error('Unexpected user-service target');
  const previousRoot=safePath(property('WorkingDirectory'));
  const exec=property('ExecStart');
  const node=exec.match(/path=([^ ;]+) ;/)?.[1];
  if(!node||!exec.includes(`argv[]=${node} `)||!(exec.includes(' server/cli.ts dist ;')||exec.includes(` ${previousRoot}/server/cli.ts ${previousRoot}/dist ;`)))throw Error('Unsupported viewer execution binding');
  safePath(node);
  if(property('ActiveState')!=='active')throw Error('Existing viewer must be active before switching');
  if(property('EnvironmentFiles'))throw Error('EnvironmentFile policy anchoring unsupported; reconcile explicitly before switching');
  const env=property('Environment'); // Never returned, printed, or persisted.
  const policyMatch=env.match(/(?:^|\s)"?ARMIS_OWNER_POLICY_PATH=([^"\s]+)"?(?:\s|$)/);
  if(env.includes('ARMIS_OWNER_POLICY_PATH=')&&!policyMatch)throw Error('Unsupported policy path encoding');
  const policyPath=safePath(resolve(previousRoot,policyMatch?.[1]??'.armis/owner-policy.json'));
  // Preserve other source bindings only when they cannot be rebound by changing cwd.
  for(const item of env.matchAll(/(?:^|\s)"?(ARMIS_[A-Z_]*(?:PATH|DB))=([^"\s]+)"?/g))if(item[1]!=='ARMIS_OWNER_POLICY_PATH'&&!item[2].startsWith('/'))throw Error('Relative source binding requires explicit reconciliation');
  const configPaths=[unit,...property('DropInPaths').split(/\s+/).filter(Boolean)];
  const dropin=join(home,'.config/systemd/user',SERVICE+'.d',DROPIN);
  if(configPaths.some(p=>dirname(p)===dirname(dropin)&&p.split('/').at(-1)>DROPIN))throw Error('Later drop-in can override switch; reconcile explicitly');
  const config=configPaths.filter(p=>p!==dropin).map(fileIdentity);
  const identity=buildIdentity(root);
  if(!recoveryRoot||!recoveryOrigin)throw Error('Explicit isolated measured recovery release required');
  recoveryRoot=safePath(resolve(recoveryRoot));recoveryOrigin=loopbackOrigin(recoveryOrigin);
  const measuredRecovery=recoveryIdentity(recoveryRoot);
  if(!existsSync(join(root,'server/cli.ts'))||!existsSync(node))throw Error('Candidate CLI/runtime unavailable');
  const ownPrevious=existsSync(dropin)?{content:readFileSync(dropin,'utf8'),...fileIdentity(dropin)}:null;
  const content=renderSwitch({root,node,policyPath});
  return {version:2,service:SERVICE,root,previousRoot,node,policyPath,dropin,config,ownPrevious,content,identity,recoveryRoot,recoveryOrigin,recoveryIdentity:measuredRecovery,recoveryContent:renderRecoverySwitch({root:recoveryRoot,node,policyPath})};
}
export function verifyConfiguration(plan,observedPaths) {
  const live=observedPaths??[property('FragmentPath'),...property('DropInPaths').split(/\s+/).filter(Boolean)];
  const expected=plan.config.map(c=>c.path).sort(),current=[...new Set(live.filter(p=>p!==plan.dropin))].sort();
  if(JSON.stringify(expected)!==JSON.stringify(current))throw Error('Service configuration paths changed since checkpoint');
  const dir=dirname(plan.dropin);
  if(existsSync(dir)) {
    const st=lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink())throw Error('Service configuration directory changed');
    if(readdirSync(dir).filter(n=>n.endsWith('.conf')).map(n=>join(dir,n)).some(p=>p!==plan.dropin&&!expected.includes(p)))throw Error('Pending service configuration changed since checkpoint');
  }
  if(observedPaths===undefined&&property('EnvironmentFiles'))throw Error('Service environment binding changed');
  for(const original of plan.config){const actual=fileIdentity(original.path);if(actual.path!==original.path||actual.hash!==original.hash||actual.mode!==original.mode)throw Error('Service configuration changed since checkpoint');}
}
function policyBinding(plan) {
  const env=property('Environment'); // Inspect only; never expose or persist credentials.
  return env.match(/(?:^|\s)"?ARMIS_OWNER_POLICY_PATH=([^"\s]+)"?(?:\s|$)/)?.[1]===plan.policyPath;
}
function atomicConfig(path,content,mode=0o600) {
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const temp=path+'.'+randomUUID();
  writeFileSync(temp,content,{flag:'wx',mode});renameSync(temp,path);
  if(readFileSync(path,'utf8')!==content)throw Error('Switch configuration read-back failed');
}
export const liveAdapter={
  identity:plan=>buildIdentity(plan.root),
  recoveryIdentity:plan=>recoveryIdentity(plan.recoveryRoot),
  recoveryConfig:plan=>renderRecoverySwitch({root:plan.recoveryRoot,node:plan.node,policyPath:plan.policyPath}),
  capture:plan=>{verifyConfiguration(plan);if(plan.ownPrevious){if(fileIdentity(plan.dropin).hash!==plan.ownPrevious.hash)throw Error('Switch changed since discovery');}else if(existsSync(plan.dropin))throw Error('Switch appeared since discovery');},
  install:plan=>{liveAdapter.capture(plan);atomicConfig(plan.dropin,plan.content);},
  restart:()=>{systemctl(['daemon-reload']);systemctl(['restart',SERVICE]);},
  active:plan=>{verifyConfiguration(plan);return policyBinding(plan)&&verifyRecoveryBinding({...plan,recoveryRoot:plan.root,recoveryContent:plan.content},{active:property('ActiveState'),root:property('WorkingDirectory'),exec:property('ExecStart'),content:readFileSync(plan.dropin,'utf8')});},
  restore:plan=>{
    verifyConfiguration(plan);
    if(!existsSync(plan.dropin)||readFileSync(plan.dropin,'utf8')!==plan.content)throw Error('Switch changed externally; refusing destructive rollback');
    atomicConfig(plan.dropin,plan.recoveryContent);
  },
  restored:plan=>{verifyConfiguration(plan);return policyBinding(plan)&&verifyRecoveryBinding(plan,{active:property('ActiveState'),root:property('WorkingDirectory'),exec:property('ExecStart'),content:readFileSync(plan.dropin,'utf8')});},
  health:async(plan,previous=false,installed=false)=>{
    // Bounded startup retries read status only; never generate work or poll for business activity.
    for(let i=0;i<3;i++){
      const identity=previous?plan.recoveryIdentity:plan.identity;
      if(!identity?.sourceHash||!identity?.buildHash)throw Error('Exact recovery/candidate identity required');
      const result=previous?await checkRecoveryReadiness({origin:installed?plan.origin:plan.recoveryOrigin,expectedIdentity:identity}):await checkReadiness({origin:plan.origin,expectedRevision:identity.revision,expectedSourceHash:identity.sourceHash,expectedBuildHash:identity.buildHash});
      if(previous?result.recoveryReady:result.viewerReady)return result;
      if(i<2)await new Promise(r=>setTimeout(r,200));
    }
    throw Error('Installed readiness failed');
  },
};
/** Transaction core is fixture-testable; no deployment runs on import. */
async function verifiedHealth(adapter,plan,recovery=false,installed=false) {
  const result=await adapter.health(plan,recovery,installed);
  if(result?.[recovery?'recoveryReady':'viewerReady']!==true)throw Error('Affirmative exact readiness required');
  return result;
}
export async function switchViewer(plan,{adapter=liveAdapter,checkpoint=()=>{}}={}) {
  const revalidate=()=>{
    const current=adapter.identity?adapter.identity(plan):buildIdentity(plan.root);
    if(['revision','sourceHash','buildHash'].some(key=>!plan.identity?.[key]||current[key]!==plan.identity[key]))throw Error('Candidate identity changed since verification');
  };
  adapter.capture(plan);
  revalidate();
  verifyRecovery(plan,adapter);
  if(plan.ownPrevious?.content===plan.content&&adapter.active(plan)) {
    const readiness=await verifiedHealth(adapter,plan);
    revalidate();
    verifyRecovery(plan,adapter);
    if(!adapter.active(plan))throw Error('Service binding changed during health');
    return {state:'already-active',changed:false,viewerReady:readiness.viewerReady,businessReady:false};
  }
  await verifiedHealth(adapter,plan,true); // Establish a verifiable recovery target before writing.
  verifyRecovery(plan,adapter);
  await checkpoint(plan);
  verifyRecovery(plan,adapter);
  revalidate(); // After every await/checkpoint, immediately before the first mutation.
  let attempted=false;
  try {
    attempted=true;adapter.install(plan);revalidate();adapter.restart();
    if(!adapter.active(plan))throw Error('Service binding read-back failed');
    const readiness=await verifiedHealth(adapter,plan);
    revalidate();
    verifyRecovery(plan,adapter);
    if(!adapter.active(plan))throw Error('Service binding changed during health');
    return {state:'activated',changed:true,viewerReady:readiness.viewerReady,businessReady:false};
  } catch {
    if(attempted) {
      try {
        verifyRecovery(plan,adapter);
        adapter.restore(plan);adapter.restart();
        if(!adapter.restored(plan))throw Error('Recovery binding failed');
        await verifiedHealth(adapter,plan,true,true);
        verifyRecovery(plan,adapter);
        if(!adapter.restored(plan))throw Error('Recovery binding changed during health');
        return {state:'rolled-back',changed:false,viewerReady:false,businessReady:false,rollbackVerified:true};
      } catch {return {state:'rollback-unverified',changed:null,viewerReady:false,businessReady:false,rollbackVerified:false};}
    }
    throw Error('Activation failed before a switch');
  }
}
export async function rollbackViewer(plan,{adapter=liveAdapter}={}) {
  verifyRecovery(plan,adapter);
  adapter.restore(plan);adapter.restart();
  if(!adapter.restored(plan))throw Error('Recovery binding failed');
  await verifiedHealth(adapter,plan,true,true);
  verifyRecovery(plan,adapter);
  if(!adapter.restored(plan))throw Error('Recovery binding changed during health');
  return {state:'rolled-back',rollbackVerified:true,businessReady:false};
}
function parseArgs(args) {
  const values={apply:false};
  for(let i=0;i<args.length;i++) {
    const name=args[i];
    if(name==='--apply')values.apply=true;
    else if(['--root','--origin','--recovery-root','--recovery-origin','--receipt','--expected-revision','--expected-source-hash','--expected-build-hash','--rollback'].includes(name)){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing deployment argument');values[name.slice(2)]=args[++i];}
    else throw Error('Unknown deployment argument');
  }
  return values;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  let lock,lockAcquired=false;
  try {
    const args=parseArgs(process.argv.slice(2)),root=resolve(args.root??process.cwd()),stateRoot=join(homedir(),'.local/state/armis-city-v2');
    if(args.rollback) {
      if(!args.apply)throw Error('Rollback requires --apply');
      const path=resolve(args.rollback);
      if(!path.startsWith(stateRoot+'/')||lstatSync(path).isSymbolicLink())throw Error('Rollback requires a private local checkpoint');
      const plan=JSON.parse(readFileSync(path,'utf8'));
      if(plan.service!==SERVICE||plan.dropin!==join(homedir(),'.config/systemd/user',SERVICE+'.d',DROPIN))throw Error('Wrong rollback target');
      mkdirSync(stateRoot,{recursive:true,mode:0o700});lock=join(stateRoot,'switch.lock');mkdirSync(lock,{mode:0o700});lockAcquired=true;
      const report=await rollbackViewer(plan);console.log(JSON.stringify(report,null,2));
    } else {
      const plan=discover(root,{recoveryRoot:args['recovery-root'],recoveryOrigin:args['recovery-origin']});plan.origin=loopbackOrigin(args.origin??'http://127.0.0.1:4173');
      if(!args.apply)console.log(JSON.stringify({state:'plan-only',service:SERVICE,previousRoot:plan.previousRoot,targetRoot:root,identity:plan.identity,configurationPreserved:true,policyStoragePreserved:true,businessReady:false},null,2));
      else {
        if(args['expected-revision']!==plan.identity.revision||args['expected-source-hash']!==plan.identity.sourceHash||args['expected-build-hash']!==plan.identity.buildHash||!args.receipt)throw Error('Explicit exact revision/source/build and test receipt required');
        validateReceipt(JSON.parse(readFileSync(resolve(args.receipt),'utf8')),plan.identity);
        mkdirSync(stateRoot,{recursive:true,mode:0o700});lock=join(stateRoot,'switch.lock');mkdirSync(lock,{mode:0o700});lockAcquired=true;
        const checkpointPath=join(stateRoot,'checkpoint-'+randomUUID()+'.json');
        const report=await switchViewer(plan,{checkpoint:value=>savePrivate(checkpointPath,value)});
        savePrivate(join(stateRoot,'result-'+randomUUID()+'.json'),{...report,checkedAt:Date.now(),checkpoint:existsSync(checkpointPath)?checkpointPath:null});
        console.log(JSON.stringify({...report,checkpoint:existsSync(checkpointPath)?checkpointPath:null},null,2));
        if(!['activated','already-active'].includes(report.state))process.exitCode=1;
      }
    }
  } catch {console.error('Deployment refused or unverified; configuration/receipt/recovery prerequisites require local review. No secret diagnostics printed.');process.exitCode=1;}
  finally {if(lockAcquired&&existsSync(lock))rmdirSync(lock);}
}
