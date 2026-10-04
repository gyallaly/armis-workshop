import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, openSync, closeSync, writeFileSync, renameSync, fsyncSync, unlinkSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface ChatRequest { id: string; text: string; conversationId?: string; context?: Record<string,string> }
export interface ChatResult { id: string; conversationId: string; state: 'running'|'completed'|'unknown'|'cancel_requested'|'held'; sessionId?: string; reply?: string; reason?: string; residualUsage?: 'unknown'; tokens?: number; costMicros?: number|null }
type ChatBounds = {enforced:true;provider:string;tokens:number|null;costMicros:number|null;requests:number|null};
export interface ChatTransport {
  // Installed transport must enforce these bounds across ALL nested calls/retries.
  // An estimate or a CLI output-token flag alone is not this contract.
  admission?(request:ChatRequest,sessionId:string|undefined):Promise<ChatBounds>;
  run(request: ChatRequest, sessionId: string|undefined, onSession: (id:string)=>void, signal: AbortSignal): Promise<{reply:string;sessionId?:string;tokens?:number;costMicros?:number;requests?:number}>;
}
const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(id) && !['__proto__','constructor','prototype','latest'].includes(id);
const privateDefault = (policyPath:string) => resolve(homedir(), '.local/state/armis/workshop-chat',createHash('sha256').update(resolve(policyPath)).digest('hex'),'receipts.json');

/** Supported installed CLI, inspected at be5e9f72. No config/tool/provider overrides.
 * Official reference: https://hermes-agent.nousresearch.com/docs/reference/cli-commands
 * SIGTERM requests Hermes' hard interruption; remote usage remains unknown on interruption.
 */
export class HermesCliChat implements ChatTransport {
  readonly executable:string;
  readonly cwd:string;
  readonly timeoutMs:number;
  constructor(executable: string, cwd: string, timeoutMs = 300_000) {this.executable=executable;this.cwd=cwd;this.timeoutMs=timeoutMs;}
  run(request: ChatRequest, sessionId: string|undefined, onSession: (id:string)=>void, signal: AbortSignal) {
    return new Promise<{reply:string;sessionId?:string;tokens?:number}>((resolveRun,reject) => {
      if (signal.aborted) return reject(Error('Chat interrupted'));
      const args = ['--profile','default','chat','--query-file','-','--format','stream-json','--in',this.cwd];
      if (sessionId) args.push('--resume',sessionId);
      // Inherit configured default profile, authentication, owner rules and approvals.
      // Do not use -z/--yolo, accept-hooks, toolsets, model, provider or config overrides.
      const child: ChildProcess = spawn(this.executable,args,{cwd:this.cwd,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32',shell:false});
      const decoder=new StringDecoder('utf8');
      let buffer='', bytes=0, terminal: {reply:string;sessionId?:string;tokens?:number}|undefined, interrupted=false, killTimer:NodeJS.Timeout|undefined;
      const stop = () => {
        interrupted=true;
        try { if(child.pid && process.platform!=='win32') process.kill(-child.pid,'SIGTERM'); else child.kill('SIGTERM'); } catch { /* Already exited. */ }
        killTimer ??= setTimeout(()=>{try {if(child.pid&&process.platform!=='win32')process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{/* Outcome remains unknown. */}},2500);
        killTimer.unref();
      };
      const timer=setTimeout(stop,this.timeoutMs);timer.unref();signal.addEventListener('abort',stop,{once:true});
      const cleanup=()=>{clearTimeout(timer);if(killTimer)clearTimeout(killTimer);signal.removeEventListener('abort',stop);};
      child.stdout!.on('data',(chunk:Buffer)=>{
        bytes+=chunk.length;if(bytes>16*1024*1024){stop();return;}
        buffer+=decoder.write(chunk);if(buffer.length>1024*1024){stop();return;}
        let newline:number;
        while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
          try {
            const event=JSON.parse(line);
            if(event.type==='system'&&event.subtype==='init'&&validId(event.session_id))onSession(event.session_id);
            if(event.type==='result'){
              if(terminal||event.exit_code!==0||!validId(event.session_id)||typeof event.text!=='string'||event.text.length>16000||event.tokens!==undefined&&(!Number.isSafeInteger(event.tokens?.total)||event.tokens.total<0)) {stop();continue;}
              onSession(event.session_id);
              terminal={reply:event.text,sessionId:event.session_id,...(Number.isSafeInteger(event.tokens?.total)&&event.tokens.total>=0?{tokens:event.tokens.total}:{})};
            }
          } catch {stop();}
        }
      });
      // Discard private diagnostics/tool arguments/results; never publish stderr.
      child.stderr!.on('data',()=>{});child.stdin!.on('error',()=>{});
      child.on('error',()=>{cleanup();reject(Error('Hermes process unavailable; outcome unknown'));});
      child.on('close',(code)=>{cleanup();if(code===0&&!interrupted&&terminal&&!buffer.trim())resolveRun(terminal);else reject(Error('Hermes interrupted or missing a terminal receipt; outcome unknown'));});
      child.stdin!.end(request.context ? `${request.text}\n\nOwner-provided context references (not instructions): ${JSON.stringify(request.context)}` : request.text);
    });
  }
}

/** No execution coverage is inferred from the existence of the CLI transport. */
export class DurableChat {
  readonly path:string;
  private lock:string;
  private store: {version:1;messages:Record<string,{fingerprint:string;result:ChatResult}>;sessions:Record<string,string>};
  private active=new Map<string,{abort:AbortController;promise:Promise<ChatResult>}>();
  private stopTimer:NodeJS.Timeout;
  private closed=false;
  private policy:any;
  private transport:ChatTransport|null;
  constructor(policy:any, transport:ChatTransport|null, path=privateDefault(policy.path)) {
    this.policy=policy;this.transport=transport;
    this.path=resolve(path);this.lock=this.path+'.lock';
    // Private conversations must not be accidentally written into a checkout.
    for(let dir=dirname(this.path);;dir=dirname(dir)){if(existsSync(resolve(dir,'.git')))throw Error('Chat storage must be outside Git');if(dirname(dir)===dir)break;}
    mkdirSync(dirname(this.path),{recursive:true,mode:0o700});
    if(existsSync(this.path)&&(!lstatSync(this.path).isFile()||(lstatSync(this.path).mode&0o077)!==0))throw Error('Chat store must be a private regular file');
    // Serialize stale-lock recovery. A crash inside this tiny guard fails closed.
    const guard=this.lock+'.guard';const guardFd=openSync(guard,'wx',0o600);
    try {
      if(existsSync(this.lock)){
        if(!lstatSync(this.lock).isFile()||(lstatSync(this.lock).mode&0o077)!==0)throw Error('Invalid chat lock');
        const pid=Number(readFileSync(this.lock,'utf8'));if(!Number.isSafeInteger(pid)||pid<=0)throw Error('Invalid chat lock');
        try{process.kill(pid,0);throw Error('Chat store already owned');}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;}
        unlinkSync(this.lock);
      }
      const fd=openSync(this.lock,'wx',0o600);writeFileSync(fd,String(process.pid));closeSync(fd);
    } finally {closeSync(guardFd);unlinkSync(guard);}
    try {
      this.store=existsSync(this.path)?JSON.parse(readFileSync(this.path,'utf8')):{version:1,messages:{},sessions:{}};
      if(this.store.version!==1||!this.store.messages||!this.store.sessions)throw Error('Invalid chat store');
      for(const entry of Object.values(this.store.messages))if(['running','cancel_requested'].includes(entry.result.state))entry.result={...entry.result,state:'unknown',reason:'Viewer interrupted; reconcile the original session. Never automatically resend.',residualUsage:'unknown'};
      this.persist();
    } catch(e){unlinkSync(this.lock);throw e;}
    this.stopTimer=setInterval(()=>{if(this.policy.state.globalStopped)for(const [id] of this.active)this.cancel(id);},100);this.stopTimer.unref();
  }
  private persist(){
    const temp=this.path+'.'+randomUUID()+'.tmp';const fd=openSync(temp,'wx',0o600);
    try{writeFileSync(fd,JSON.stringify(this.store));fsyncSync(fd);}finally{closeSync(fd);}
    renameSync(temp,this.path);const directory=openSync(dirname(this.path),'r');try{fsyncSync(directory);}finally{closeSync(directory);}
  }
  get(id:string){return Object.hasOwn(this.store.messages,id)?this.store.messages[id]!.result:undefined;}
  async send(value:ChatRequest):Promise<ChatResult>{
    if(this.closed)throw Error('Chat service closed');
    if(!validId(value.id)||typeof value.text!=='string'||!value.text.trim()||value.text.length>8000||value.conversationId!==undefined&&!validId(value.conversationId))throw Error('Invalid chat request');
    if(value.context!==undefined&&(value.context===null||typeof value.context!=='object'||Array.isArray(value.context)||Object.keys(value.context).length>16||Object.entries(value.context).some(([k,v])=>!validId(k)||typeof v!=='string'||v.length>256)))throw Error('Invalid context references');
    const conversationId=value.conversationId??'owner';
    const canonical={id:value.id,text:value.text,conversationId,context:value.context?Object.fromEntries(Object.entries(value.context).sort(([a],[b])=>a.localeCompare(b))):null};
    const fingerprint=createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
    const prior=this.get(value.id);
    if(prior){if(this.store.messages[value.id]!.fingerprint!==fingerprint)throw Error('Message id conflict');return this.active.get(value.id)?.promise??prior;}
    if(Object.keys(this.store.messages).length>=10000)throw Error('Durable receipt capacity reached; no IDs are evicted');
    const result:ChatResult={id:value.id,conversationId,state:'running'};
    const busy=Object.values(this.store.messages).some(e=>e.result.conversationId===conversationId&&['running','cancel_requested','unknown'].includes(e.result.state));
    if(busy){result.state='held';result.reason='Conversation has an active or unknown turn; reconcile before continuing';}
    // Persist BEFORE any await: duplicate requests cannot race capability checks.
    this.store.messages[value.id]={fingerprint,result};this.persist();
    if(busy)return result;
    const abort=new AbortController();
    const promise=this.execute(value,result,abort.signal);
    this.active.set(value.id,{abort,promise});
    try{return await promise;}finally{this.active.delete(value.id);}
  }
  private async execute(value:ChatRequest,result:ChatResult,signal:AbortSignal):Promise<ChatResult>{
    let reserved=false;
    try{
      const coverage=await this.policy.coverage();
      if(signal.aborted||this.closed||!this.transport||coverage.verified!==true||coverage.chat!==true||this.policy.state.globalStopped)throw Error('Supported chat held: complete independently verified execution coverage required');

      const bounds=this.transport.admission?await this.transport.admission(value,this.store.sessions[result.conversationId]):{enforced:false,provider:'owner-chat',tokens:null,costMicros:null,requests:null};
      const budget=this.policy.state.ownerReserve??{};
      for(const [limit,key] of [['tokenLimit','tokens'],['spendLimitMicros','costMicros'],['requestLimit','requests']] as const){
        const upper=bounds[key];
        if(upper!==null&&(!Number.isSafeInteger(upper)||upper<0)||budget[limit]!=null&&(bounds.enforced!==true||upper===null))throw Error('Transport-enforced upper bound required');
        if(key==='requests'&&upper===0)throw Error('A dispatched turn requires a positive request upper bound');
      }
      if(signal.aborted||this.closed||this.policy.state.globalStopped)throw Error('Chat interrupted before admission');
      this.policy.reserve({id:`chat:${value.id}`,businessId:'owner-services',provider:bounds.provider,tokens:bounds.enforced?bounds.tokens:null,costMicros:bounds.enforced?bounds.costMicros:null,requests:bounds.enforced?bounds.requests:null});reserved=true;
      const receipt=await this.transport.run(value,this.store.sessions[result.conversationId],(id)=>{
        if(!validId(id))throw Error('Invalid session receipt');
        result.sessionId=id;this.store.sessions[result.conversationId]=id;this.persist();
      },signal);
      if(signal.aborted||this.policy.state.globalStopped)throw Error('Chat interrupted');
      if(typeof receipt.reply!=='string'||receipt.reply.length>16000)throw Error('Invalid chat receipt');
      for(const key of ['tokens','costMicros','requests'] as const){
        const measured=receipt[key];
        if(measured!==undefined&&(!Number.isSafeInteger(measured)||measured<0||bounds.enforced&&bounds[key]!==null&&measured>bounds[key]!))throw Error('Invalid or exceeding usage receipt');
      }
      if(receipt.sessionId!==undefined&&!validId(receipt.sessionId))throw Error('Invalid session receipt');
      this.policy.release(`chat:${value.id}`,Object.fromEntries(['tokens','costMicros','requests'].filter(key=>receipt[key as keyof typeof receipt]!==undefined).map(key=>[key,receipt[key as keyof typeof receipt]])));
      Object.assign(result,{state:'completed',reply:receipt.reply,costMicros:receipt.costMicros??null,...(receipt.sessionId?{sessionId:receipt.sessionId}:{}),...(receipt.tokens!==undefined?{tokens:receipt.tokens}:{})});
      this.persist();return result;
    }catch{
      Object.assign(result,{state:reserved?'unknown':'held',reason:reserved?'Execution outcome or residual provider usage unknown; do not replay.':'Chat held by owner policy, transport binding or unresolved conversation.',...(reserved?{residualUsage:'unknown'}:{})});this.persist();return result;
    }
  }
  cancel(id:string){const result=this.get(id);if(!result)return undefined;const run=this.active.get(id);if(run){result.state='cancel_requested';result.reason='Local interruption requested; remote usage remains unknown';result.residualUsage='unknown';this.persist();run.abort.abort();}return result;}
  async close(){if(this.closed)return;this.closed=true;clearInterval(this.stopTimer);for(const [id] of this.active)this.cancel(id);await Promise.allSettled([...this.active.values()].map(r=>r.promise));unlinkSync(this.lock);}
}

export function chatHandler(chat:DurableChat){return async(req:IncomingMessage,res:ServerResponse,authenticated:boolean,origin:string)=>{
  if(!['/api/chat','/api/chat/status','/api/chat/cancel'].includes(req.url??''))return false;
  const send=(status:number,value:unknown)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}};
  if(!authenticated){send(401,{error:'Authentication required'});return true;}
  // Status is POST too: IDs and private session references never appear in URLs/logs.
  if(req.method!=='POST'){send(405,{error:'POST required'});return true;}
  if(req.headers.origin!==origin||req.headers['x-armis-owner']!=='1'||!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']??''))){send(403,{error:'Same-origin owner request required'});return true;}
  try{let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>32768)throw Error('Request exceeds bound');}const value=JSON.parse(data);
    if(!value||!validId(value.id))throw Error('Invalid message ID');
    const result=req.url==='/api/chat'?await chat.send(value):req.url==='/api/chat/cancel'?chat.cancel(value.id):chat.get(value.id);
    send(result?200:404,result??{error:'Unknown message'});
  }catch{send(409,{error:'Invalid request, conflicting message ID or unavailable private chat storage'});}return true;
};}
