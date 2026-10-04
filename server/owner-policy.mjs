import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

export const COMPANIES = ['hermes-hq','uditus','etsy-studio','aster-ledger'];
export const EXECUTION_PATHS = Object.freeze(['owner-chat','main-chat','auxiliary-models','executives','workers','delegations','schedules','retries','provider-adapters','tool-processes']);
const paths = EXECUTION_PATHS;
const uncoveredInventory=()=>paths.map(path=>({path,controlled:false,evidence:'unsupported-or-unverified'}));
const initial = () => ({version:2,revision:0,globalStopped:false,companies:Object.fromEntries(COMPANIES.map(id=>[id,{lifecycle:'running',weight:25,maxConcurrent:id==='uditus'?1:3,tokenLimit:null,requestLimit:null,spendLimitMicros:null,allowedProviders:null,consumedTokens:0,consumedRequests:0,consumedCostMicros:0,usageProvenance:'unreported'}])),receipts:[],reservations:[],chats:{}});
/** A synchronous durable gate. Every supported executor must acquire before inference. */
export class OwnerPolicy {
  /** @param {string} path @param {any} executor @param {any} verifyExecution */
  constructor(path, executor = null, verifyExecution=null) {
    this.path=path; this.executor=executor; this.tail=Promise.resolve();
    this.verifyExecution=verifyExecution;
    this.pendingCommands=new Map();
    this.state=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):initial();
    if(this.state.version!==2 || !Number.isSafeInteger(this.state.revision) || !Array.isArray(this.state.reservations) || !Array.isArray(this.state.receipts) || !COMPANIES.every(id=>this.state.companies[id])) throw Error('Invalid owner policy store');
    this.state.chats??={};
    this.state.completedReservations??={};
    this.state.commandRecords??={};
    this.state.pendingApplications??=[];
    for(const receipt of this.state.receipts)if(!Object.hasOwn(this.state.commandRecords,receipt.id))Object.defineProperty(this.state.commandRecords,receipt.id,{value:{fingerprint:receipt.fingerprint,receipt},enumerable:true,writable:true,configurable:true});
    this.state.ownerReserve??={lifecycle:'running',weight:100,maxConcurrent:1,tokenLimit:null,requestLimit:null,spendLimitMicros:null,allowedProviders:null,consumedTokens:0,consumedRequests:0,consumedCostMicros:0,usageProvenance:'unreported'};
    for(const record of Object.values(this.state.chats))if(record.result.state==='queued')record.result={id:record.result.id,state:'failed',reason:'Viewer restarted during chat; remote outcome requires reconciliation. Message will not be resent automatically.'};
    // In-flight reservations survive restart and must be reconciled, never silently refunded.
    this.persist();
  }
  persist() {
    mkdirSync(dirname(this.path),{recursive:true});
    const temporary=`${this.path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary,JSON.stringify(this.state),{flag:'wx',mode:0o600});
      renameSync(temporary,this.path);
    } finally {if(existsSync(temporary))unlinkSync(temporary);}
  }
  async coverage() {
    if(!this.executor) return {verified:false,covered:[],uncovered:paths,inventory:uncoveredInventory(),reason:'No supported Hermes executor configured'};
    try {
      const result=await this.executor.capabilities();
      const proof=this.verifyExecution?await this.verifyExecution(result):{verified:false,reason:'Independent installed execution checks missing'};
      const asserted=paths.filter(p=>Array.isArray(result.covered)&&result.covered.includes(p));
      // A blanket success is not per-entry-point execution evidence. Only the
      // intersection independently checked by the installation verifier counts.
      const covered=result.verified===true&&proof.verified===true?asserted.filter(p=>Array.isArray(proof.covered)&&proof.covered.includes(p)):[];
      return {verified:result.verified===true&&proof.verified===true&&covered.length===paths.length,covered,asserted,uncovered:paths.filter(p=>!covered.includes(p)),inventory:paths.map(path=>({path,controlled:covered.includes(path),evidence:covered.includes(path)?'independent-execution-verifier':'unsupported-or-unverified'})),chat:result.chat===true,recipient:result.recipient,reason:proof.reason??(covered.length===paths.length?undefined:'Independent per-path execution coverage is incomplete')};
    } catch {return {verified:false,covered:[],uncovered:paths,inventory:uncoveredInventory(),reason:'Configured executor capability or installed-evidence check failed'};}
  }
  async view() { const coverage=await this.coverage(); const {version,revision,globalStopped,companies,reservations}=this.state;return {version,revision,globalStopped,companies,reservations,ownerReserve:{...this.state.ownerReserve,activeReservations:reservations.filter(r=>r.businessId==='owner-services').length},receipts:this.state.receipts.map(({fingerprint,...receipt})=>receipt),capabilities:{companyControl:coverage.verified,allocations:coverage.verified,chat:coverage.verified&&coverage.chat===true},coverage,recipient:coverage.recipient}; }
  command(command) {
    // Freeze the request at entry, bind its ID durably before any async work,
    // and never replay an unknown outcome after process restart.
    try {command=JSON.parse(JSON.stringify(command));}catch{return Promise.reject(Error('Invalid command'));}
    const fingerprint=JSON.stringify(command);
    const recorded=Object.hasOwn(this.state.commandRecords,command?.id)?this.state.commandRecords[command.id]:null;
    if(recorded) {
      if(recorded.fingerprint!==fingerprint)return Promise.reject(Error('Command id reused with different content'));
      return this.pendingCommands.get(command.id)??Promise.resolve(recorded.receipt??{id:command.id,type:command.type,state:'acknowledged',reason:'Command outcome requires reconciliation; it will not be replayed automatically'});
    }
    // Synchronous emergency fencing must not wait behind a remote capability or
    // policy acknowledgement. Invalid/replayed commands cannot change the fence.
    const previous=this.state.receipts.find(r=>r.id===command?.id);
    if(previous) return previous.fingerprint===JSON.stringify(command)?Promise.resolve(previous):Promise.reject(Error('Command id reused with different content'));
    if(!command||typeof command.id!=='string'||!/^[A-Za-z0-9_.:-]{1,120}$/.test(command.id))return Promise.reject(Error('Invalid command id'));
    if(!Number.isSafeInteger(command.expiresAt)||command.expiresAt<Date.now()||command.expiresAt>Date.now()+300000)return Promise.reject(Error('Command expired or invalid expiry'));
    if(command.expectedRevision!==this.state.revision)return Promise.reject(Error('Policy revision conflict; reload current policy'));
    if(!['company.stop','company.pause','company.resume','allocation.set','global.stop','global.resume'].includes(command.type))return Promise.reject(Error('Unsupported command'));
    if(!command.type.startsWith('global.')&&!COMPANIES.includes(command.businessId))return Promise.reject(Error('Unknown company'));
    Object.defineProperty(this.state.commandRecords,command.id,{value:{fingerprint},enumerable:true,writable:true,configurable:true});
    const stop=command?.type==='company.stop'||command?.type==='global.stop';
    if(stop) {
      if(typeof command.id!=='string'||!/^[A-Za-z0-9_.:-]{1,120}$/.test(command.id))return Promise.reject(Error('Invalid command id'));
      if(!Number.isSafeInteger(command.expiresAt)||command.expiresAt<Date.now()||command.expiresAt>Date.now()+300000)return Promise.reject(Error('Command expired or invalid expiry'));
      if(command.expectedRevision!==this.state.revision)return Promise.reject(Error('Policy revision conflict; reload current policy'));
      if(command.type==='company.stop'&&!COMPANIES.includes(command.businessId))return Promise.reject(Error('Unknown company'));
      this.state.pendingStops??=[];
      this.state.pendingStops.push({id:command.id,businessId:command.type==='global.stop'?'*':command.businessId});
      if(command.type==='global.stop') {if(!this.state.globalStopped)this.state.preGlobalLifecycle=Object.fromEntries(COMPANIES.map(id=>[id,this.state.companies[id].lifecycle]));this.state.globalStopped=true;this.state.ownerReserve.lifecycle='stopping';}
      for(const id of command.type==='global.stop'?COMPANIES:[command.businessId]) this.state.companies[id].lifecycle='stopping';
      this.persist();
    }
    const priorStopIds=(this.state.pendingStops??[]).map(s=>s.id);
    this.persist();
    const run=this.tail.then(()=>this.apply(command,priorStopIds)).catch(error=>{
      this.receipt(command,'rejected',error.message);throw error;
    }).finally(()=>this.pendingCommands.delete(command.id));
    this.pendingCommands.set(command.id,run);this.tail=run.catch(()=>{}); return run;
  }
  async apply(c,priorStopIds=[]) {
    if(!c || typeof c.id!=='string' || !/^[A-Za-z0-9_.:-]{1,120}$/.test(c.id)) throw Error('Invalid command id');
    const previous=this.state.receipts.find(r=>r.id===c.id);
    if(previous) {if(previous.fingerprint!==JSON.stringify(c)) throw Error('Command id reused with different content'); return previous;}
    if(!Number.isSafeInteger(c.expiresAt)||c.expiresAt<Date.now()||c.expiresAt>Date.now()+300000)throw Error('Command expired or invalid expiry');
    if(c.expectedRevision!==this.state.revision) throw Error('Policy revision conflict; reload current policy');
    if(!['company.stop','company.pause','company.resume','allocation.set','global.stop','global.resume'].includes(c.type)) throw Error('Unsupported command');
    if(!c.type.startsWith('global.')&&!COMPANIES.includes(c.businessId)) throw Error('Unknown company');
    const coverage=await this.coverage();
    if(!coverage.verified) return this.receipt(c,'rejected','Execution coverage is incomplete; no live control can be claimed');
    if(c.expectedRevision!==this.state.revision)throw Error('Policy revision conflict; reload current policy');
    const company=this.state.companies[c.businessId];
    if(c.type==='allocation.set') {
      const a=c.allocation;
      if(!a || !Number.isFinite(a.weight)||a.weight<0||a.weight>100||!Number.isSafeInteger(a.maxConcurrent)||a.maxConcurrent<0||a.maxConcurrent>12) throw Error('Invalid allocation');
      if(c.businessId==='uditus'&&a.maxConcurrent>1) throw Error('Uditus remains serialized until verified separately');
      for(const key of ['tokenLimit','requestLimit','spendLimitMicros'])if(a[key]!==undefined&&a[key]!==null&&(!Number.isSafeInteger(a[key])||a[key]<0))throw Error('Invalid enforceable usage bound');
      if(a.allowedProviders!==undefined&&a.allowedProviders!==null&&(!Array.isArray(a.allowedProviders)||a.allowedProviders.length>20||!a.allowedProviders.every(p=>typeof p==='string'&&/^[A-Za-z0-9_.:-]{1,120}$/.test(p))||new Set(a.allowedProviders).size!==a.allowedProviders.length))throw Error('Invalid provider routes');
      Object.assign(company,{weight:a.weight,maxConcurrent:a.maxConcurrent});
      for(const key of ['tokenLimit','requestLimit','spendLimitMicros'])if(a[key]!==undefined)company[key]=a[key];
      if(a.allowedProviders!==undefined)company.allowedProviders=a.allowedProviders;
    }
    if(c.type==='company.pause') company.lifecycle='draining';
    if(c.type==='company.resume') company.lifecycle='running';
    if(c.type==='global.resume') {this.state.globalStopped=false;this.state.ownerReserve.lifecycle='running';for(const id of COMPANIES)this.state.companies[id].lifecycle=this.state.preGlobalLifecycle?.[id]??'stopped';}
    const stop=c.type==='company.stop'||c.type==='global.stop';
    if(stop) {if(c.type==='global.stop') {this.state.globalStopped=true;this.state.ownerReserve.lifecycle='stopping';} for(const id of c.type==='global.stop'?COMPANIES:[c.businessId]) this.state.companies[id].lifecycle='stopping';}
    this.state.revision++;
    if(['company.resume','global.resume','allocation.set'].includes(c.type))this.state.pendingApplications.push(c.id);
    const receipt=this.receipt(c,'acknowledged');
    // Policy fence persists before cancellation/remote acknowledgement.
    try {
      let policyError;
      try {const result=await this.executor.policy(JSON.parse(JSON.stringify({...this.state,commandId:c.id})));if(result?.applied!==true)throw Error('Executor did not confirm effective policy');}
      catch(error) {if(!stop)throw error;policyError=error;}
      if(stop) {
        const incomplete=[];
        for(const id of c.type==='global.stop'?[...COMPANIES,'owner-services']:[c.businessId]) {
          try {
            const cancellation=await this.executor.cancel(id);
            if(cancellation?.stopped!==true||cancellation.residualUsage!==false)throw Error('Unreconciled cancellation');
            for(const r of [...this.state.reservations])if(r.businessId===id)this.release(r.id);
            (id==='owner-services'?this.state.ownerReserve:this.state.companies[id]).lifecycle='stopped';
            this.persist();
          } catch {incomplete.push(id);}
        }
        if(incomplete.length)throw Error(`Cancellation incomplete; building remains stopping with possible residual usage: ${incomplete.join(', ')}`);
      }
      if(policyError)throw policyError;
      receipt.state='effective';
      this.state.pendingApplications=this.state.pendingApplications.filter(id=>id!==c.id);
      if(stop)this.state.pendingStops=(this.state.pendingStops??[]).filter(s=>s.id!==c.id);
      if(c.type==='global.resume'||c.type==='company.resume')this.state.pendingStops=(this.state.pendingStops??[]).filter(s=>!priorStopIds.includes(s.id)||c.type==='company.resume'&&s.businessId!==c.businessId);
    } catch(e) {receipt.reason=e.message;}
    this.persist();return receipt;
  }
  receipt(c,state,reason) {const r={id:c.id,type:c.type,state,reason,at:Date.now(),fingerprint:JSON.stringify(c)};this.state.receipts.push(r);this.state.receipts=this.state.receipts.slice(-500);this.state.commandRecords[c.id]={fingerprint:r.fingerprint,receipt:r};this.persist();return r;}
  /** Verified runtime entry. reserve() alone is only a synchronous local gate. */
  async admit(request) {if(!(await this.coverage()).verified)throw Error('Execution coverage is unverified');return this.reserve(request);}
  reserve({id,businessId,provider,tokens=null,costMicros=null,requests=1}) {
    const validBound=value=>value===null||Number.isSafeInteger(value)&&value>=0;
    if(typeof id!=='string'||!/^[A-Za-z0-9_.:-]{1,120}$/.test(id)||![...COMPANIES,'owner-services'].includes(businessId)||typeof provider!=='string'||!/^[A-Za-z0-9_.:-]{1,120}$/.test(provider)||![tokens,costMicros,requests].every(validBound)) throw Error('Invalid reservation');
    if(Object.hasOwn(this.state.completedReservations,id))throw Error('Reservation already reconciled; cannot replay execution');
    const existing=this.state.reservations.find(r=>r.id===id);
    if(existing && (existing.businessId!==businessId||existing.provider!==provider||existing.tokens!==tokens||existing.costMicros!==costMicros||(Object.hasOwn(existing,'requests')?existing.requests:1)!==requests)) throw Error('Reservation conflict');
    const company=businessId==='owner-services'?this.state.ownerReserve:this.state.companies[businessId];
    if(company.allowedProviders!==undefined&&company.allowedProviders!==null&&!company.allowedProviders.includes(provider))throw Error('Provider route forbidden by owner policy');
    if(this.state.pendingApplications.length||this.state.receipts.some(r=>r.state==='acknowledged'&&['company.resume','global.resume','allocation.set'].includes(r.type)))throw Error('Policy application awaits reconciliation');
    if((this.state.pendingStops??[]).some(s=>s.businessId==='*'||s.businessId===businessId)||this.state.globalStopped||company.lifecycle!=='running'||company.weight===0||!existing&&this.state.reservations.filter(r=>r.businessId===businessId).length>=company.maxConcurrent) throw Error('Owner policy holds this admission');
    if(existing)return existing;
    const outstanding=this.state.reservations.filter(r=>r.businessId===businessId);
    for(const [limit,key,consumed,unknown,value] of [['tokenLimit','tokens','consumedTokens','unknownTokens',tokens],['requestLimit','requests','consumedRequests','unknownRequests',requests],['spendLimitMicros','costMicros','consumedCostMicros','unknownCost',costMicros]]){
      if(company[limit]==null)continue;
      const amount=r=>key==='requests'&&!Object.hasOwn(r,key)?1:r[key];
      if(value===null||company[unknown]||outstanding.some(r=>amount(r)==null))throw Error('Unknown usage or missing enforceable upper bound');
      if(key==='tokens'&&value===0)throw Error('Explicit positive token upper bound required for finite token budget');
      const total=(company[consumed]??0)+outstanding.reduce((sum,r)=>sum+amount(r),0)+value;
      if(!Number.isSafeInteger(total)||total>company[limit])throw Error('Owner usage bound exhausted');
    }
    const reservation={id,businessId,provider,tokens,costMicros,requests,at:Date.now()};this.state.reservations.push(reservation);this.persist();return reservation;
  }
  release(id,usage) {
    if(typeof id!=='string'||!/^[A-Za-z0-9_.:-]{1,120}$/.test(id))throw Error('Invalid reservation');
    if(usage!==undefined&&(usage===null||typeof usage!=='object'||Array.isArray(usage)||Object.entries(usage).some(([key,value])=>!['tokens','costMicros','requests'].includes(key)||!Number.isSafeInteger(value)||value<0)))throw Error('Invalid reconciled usage');
    const reservation=this.state.reservations.find(r=>r.id===id);
    if(!reservation) {
      const completed=Object.hasOwn(this.state.completedReservations,id)?this.state.completedReservations[id]:null;
      if(!completed)throw Error('Unknown reservation; reconciliation cannot be claimed');
      if(usage&&(['tokens','costMicros','requests'].some(key=>usage[key]!==undefined&&usage[key]!==completed[key])))throw Error('Reconciled usage conflict');
      return completed;
    }
    const company=reservation.businessId==='owner-services'?this.state.ownerReserve:this.state.companies[reservation.businessId];
    const tokens=usage?.tokens??reservation.tokens??null,costMicros=usage?.costMicros??reservation.costMicros??null,requests=usage?.requests??(Object.hasOwn(reservation,'requests')?reservation.requests:1);
    // Counters are known lower bounds if any completed consumption is unknown.
    // Unknown money is never turned into a zero cost upper bound or billing claim.
    // One completed owner dispatch is observed even when its nested request total
    // is unknown. This lower bound cannot justify admission under a finite ceiling.
    const requestLowerBound=requests??(reservation.businessId==='owner-services'?1:0);
    const totals={consumedTokens:(company.consumedTokens??0)+(tokens??0),consumedRequests:(company.consumedRequests??0)+requestLowerBound,consumedCostMicros:(company.consumedCostMicros??0)+(costMicros??0)};
    if(!Object.values(totals).every(Number.isSafeInteger))throw Error('Reconciled usage counter overflow');
    Object.assign(company,totals);
    company.unknownTokens=company.unknownTokens===true||tokens===null;
    company.unknownRequests=company.unknownRequests===true||requests===null;
    company.unknownCost=company.unknownCost===true||costMicros===null;
    company.usageProvenance=company.unknownTokens||company.unknownRequests||company.unknownCost?'unknown':usage?.tokens!==undefined&&usage?.costMicros!==undefined&&company.usageProvenance!=='reservation_upper_bound'?'locally_measured':'reservation_upper_bound';
    const completed={at:Date.now(),businessId:reservation.businessId,tokens,costMicros,requests};
    Object.defineProperty(this.state.completedReservations,id,{value:completed,enumerable:true,configurable:false,writable:false});
    this.state.reservations=this.state.reservations.filter(r=>r.id!==id);this.persist();return completed;
  }
}

/** Only an explicitly installed supported HTTP bridge. No guessed Hermes CLI. */
export class HttpExecutor {
  constructor(url, token) { const u=new URL(url); if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!token) throw Error('Invalid executor binding'); this.url=u;this.token=token; }
  async call(path,body) {const response=await fetch(new URL(path,this.url),{method:body?'POST':'GET',headers:{Authorization:`Bearer ${this.token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15_000)}); if(!response.ok) throw Error('Hermes executor request failed'); const text=await response.text();if(text.length>100_000)throw Error('Executor response exceeds bound');return JSON.parse(text);}
  capabilities(){return this.call('capabilities');} policy(body){return this.call('policy',body);} cancel(businessId){return this.call('cancel',{businessId});} chat(body){return this.call('chat',body);}
}
