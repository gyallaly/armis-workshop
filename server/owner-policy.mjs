import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const COMPANIES = ['hermes-hq','uditus','etsy-studio','aster-ledger'];
const paths = ['owner-chat','executives','workers','delegations','schedules','retries','provider-adapters','tool-processes'];
const initial = () => ({version:2,revision:0,globalStopped:false,companies:Object.fromEntries(COMPANIES.map(id=>[id,{lifecycle:'running',weight:25,maxConcurrent:id==='uditus'?1:3,tokenLimit:null,requestLimit:null,spendLimitMicros:null,allowedProviders:null,consumedTokens:0,consumedRequests:0,consumedCostMicros:0,usageProvenance:'unreported'}])),receipts:[],reservations:[],chats:{}});
/** A synchronous durable gate. Every supported executor must acquire before inference. */
export class OwnerPolicy {
  constructor(path, executor = null) {
    this.path=path; this.executor=executor; this.tail=Promise.resolve();
    this.state=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):initial();
    if(this.state.version!==2 || !Number.isSafeInteger(this.state.revision) || !Array.isArray(this.state.reservations) || !Array.isArray(this.state.receipts) || !COMPANIES.every(id=>this.state.companies[id])) throw Error('Invalid owner policy store');
    this.state.chats??={};
    this.state.ownerReserve??={lifecycle:'running',weight:100,maxConcurrent:1,tokenLimit:null,requestLimit:null,spendLimitMicros:null,allowedProviders:null,consumedTokens:0,consumedRequests:0,consumedCostMicros:0,usageProvenance:'unreported'};
    for(const record of Object.values(this.state.chats))if(record.result.state==='queued')record.result={id:record.result.id,state:'failed',reason:'Viewer restarted during chat; remote outcome requires reconciliation. Message will not be resent automatically.'};
    // In-flight reservations survive restart and must be reconciled, never silently refunded.
    this.persist();
  }
  persist() { mkdirSync(dirname(this.path),{recursive:true}); writeFileSync(this.path+'.tmp',JSON.stringify(this.state),{mode:0o600}); renameSync(this.path+'.tmp',this.path); }
  async coverage() {
    if(!this.executor) return {verified:false,covered:[],uncovered:paths,reason:'No supported Hermes executor configured'};
    try {const result=await this.executor.capabilities(); const covered=paths.filter(p=>result.covered?.includes(p)); return {verified:result.verified===true&&covered.length===paths.length,covered,uncovered:paths.filter(p=>!covered.includes(p)),chat:result.chat===true,recipient:result.recipient};} catch {return {verified:false,covered:[],uncovered:paths,reason:'Configured executor capability check failed'};}
  }
  async view() { const coverage=await this.coverage(); const {version,revision,globalStopped,companies,reservations}=this.state;return {version,revision,globalStopped,companies,reservations,ownerReserve:{...this.state.ownerReserve,activeReservations:reservations.filter(r=>r.businessId==='owner-services').length},receipts:this.state.receipts.map(({fingerprint,...receipt})=>receipt),capabilities:{companyControl:coverage.verified,allocations:coverage.verified,chat:coverage.verified&&coverage.chat===true},coverage,recipient:coverage.recipient}; }
  command(command) { const run=this.tail.then(()=>this.apply(command)); this.tail=run.catch(()=>{}); return run; }
  async apply(c) {
    if(!c || typeof c.id!=='string' || !/^[A-Za-z0-9_.:-]{1,120}$/.test(c.id)) throw Error('Invalid command id');
    const previous=this.state.receipts.find(r=>r.id===c.id);
    if(previous) {if(previous.fingerprint!==JSON.stringify(c)) throw Error('Command id reused with different content'); return previous;}
    if(!Number.isSafeInteger(c.expiresAt)||c.expiresAt<Date.now()||c.expiresAt>Date.now()+300000)throw Error('Command expired or invalid expiry');
    if(c.expectedRevision!==this.state.revision) throw Error('Policy revision conflict; reload current policy');
    if(!['company.stop','company.pause','company.resume','allocation.set','global.stop','global.resume'].includes(c.type)) throw Error('Unsupported command');
    if(!c.type.startsWith('global.')&&!COMPANIES.includes(c.businessId)) throw Error('Unknown company');
    const coverage=await this.coverage();
    if(!coverage.verified) return this.receipt(c,'rejected','Execution coverage is incomplete; no live control can be claimed');
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
    if(c.type==='global.resume') {this.state.globalStopped=false;this.state.ownerReserve.lifecycle='running';for(const id of COMPANIES)this.state.companies[id].lifecycle='running';}
    const stop=c.type==='company.stop'||c.type==='global.stop';
    if(stop) {if(c.type==='global.stop') {this.state.globalStopped=true;this.state.ownerReserve.lifecycle='stopping';} for(const id of c.type==='global.stop'?COMPANIES:[c.businessId]) this.state.companies[id].lifecycle='stopping';}
    this.state.revision++; const receipt=this.receipt(c,'acknowledged');
    // Policy fence persists before cancellation/remote acknowledgement.
    try {
      const result=await this.executor.policy({...this.state,commandId:c.id});
      if(result?.applied!==true) throw Error('Executor did not confirm effective policy');
      if(stop) {
        for(const id of c.type==='global.stop'?[...COMPANIES,'owner-services']:[c.businessId]) {
          const cancellation=await this.executor.cancel(id);
          if(cancellation?.stopped===true && cancellation.residualUsage===false) {
            (id==='owner-services'?this.state.ownerReserve:this.state.companies[id]).lifecycle='stopped';
            for(const r of [...this.state.reservations])if(r.businessId===id)this.release(r.id);
          } else throw Error('Cancellation incomplete; building remains stopping with possible residual usage');
        }
      }
      receipt.state='effective';
    } catch(e) {receipt.reason=e.message;}
    this.persist();return receipt;
  }
  receipt(c,state,reason) {const r={id:c.id,type:c.type,state,reason,at:Date.now(),fingerprint:JSON.stringify(c)};this.state.receipts.push(r);this.state.receipts=this.state.receipts.slice(-500);this.persist();return r;}
  reserve({id,businessId,provider,tokens=0,costMicros=0}) {
    if(!/^[A-Za-z0-9_.:-]{1,120}$/.test(id??'')||![...COMPANIES,'owner-services'].includes(businessId)||typeof provider!=='string'||!provider||provider.length>120||!Number.isSafeInteger(tokens)||tokens<0||!Number.isSafeInteger(costMicros)||costMicros<0) throw Error('Invalid reservation');
    const existing=this.state.reservations.find(r=>r.id===id);
    if(existing) {if(existing.businessId!==businessId||existing.provider!==provider||existing.tokens!==tokens||existing.costMicros!==costMicros) throw Error('Reservation conflict');return existing;}
    const company=businessId==='owner-services'?this.state.ownerReserve:this.state.companies[businessId];
    if(company.allowedProviders!==undefined&&company.allowedProviders!==null&&!company.allowedProviders.includes(provider))throw Error('Provider route forbidden by owner policy');
    if(this.state.receipts.some(r=>r.state==='acknowledged'&&['company.resume','global.resume','allocation.set'].includes(r.type)))throw Error('Policy application awaits reconciliation');
    if(this.state.globalStopped||company.lifecycle!=='running'||company.weight===0||this.state.reservations.filter(r=>r.businessId===businessId).length>=company.maxConcurrent) throw Error('Owner policy holds this admission');
    const outstanding=this.state.reservations.filter(r=>r.businessId===businessId);
    if(company.tokenLimit!=null&&(company.consumedTokens??0)+outstanding.reduce((sum,r)=>sum+r.tokens,0)+tokens>company.tokenLimit||company.requestLimit!=null&&(company.consumedRequests??0)+outstanding.length+1>company.requestLimit||company.spendLimitMicros!=null&&(company.consumedCostMicros??0)+outstanding.reduce((sum,r)=>sum+(r.costMicros??0),0)+costMicros>company.spendLimitMicros)throw Error('Owner usage bound exhausted');
    const reservation={id,businessId,provider,tokens,costMicros,at:Date.now()};this.state.reservations.push(reservation);this.persist();return reservation;
  }
  release(id,usage) {const reservation=this.state.reservations.find(r=>r.id===id);if(reservation){const company=reservation.businessId==='owner-services'?this.state.ownerReserve:this.state.companies[reservation.businessId];const tokens=usage?.tokens??reservation.tokens,costMicros=usage?.costMicros??reservation.costMicros??0;if(!Number.isSafeInteger(tokens)||tokens<0||!Number.isSafeInteger(costMicros)||costMicros<0)throw Error('Invalid reconciled usage');company.consumedTokens=(company.consumedTokens??0)+tokens;company.consumedRequests=(company.consumedRequests??0)+1;company.consumedCostMicros=(company.consumedCostMicros??0)+costMicros;company.usageProvenance=usage?.tokens!==undefined&&usage?.costMicros!==undefined&&company.usageProvenance!=='reservation_upper_bound'?'locally_measured':'reservation_upper_bound';}this.state.reservations=this.state.reservations.filter(r=>r.id!==id);this.persist();}
}

/** Only an explicitly installed supported HTTP bridge. No guessed Hermes CLI. */
export class HttpExecutor {
  constructor(url, token) { const u=new URL(url); if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!token) throw Error('Invalid executor binding'); this.url=u;this.token=token; }
  async call(path,body) {const response=await fetch(new URL(path,this.url),{method:body?'POST':'GET',headers:{Authorization:`Bearer ${this.token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15_000)}); if(!response.ok) throw Error('Hermes executor request failed'); const text=await response.text();if(text.length>100_000)throw Error('Executor response exceeds bound');return JSON.parse(text);}
  capabilities(){return this.call('capabilities');} policy(body){return this.call('policy',body);} cancel(businessId){return this.call('cancel',{businessId});} chat(body){return this.call('chat',body);}
}
