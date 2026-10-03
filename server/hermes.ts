import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import type { RuntimeEvent } from './observations.ts';

const TOOLS = new Set(['terminal','read_file','write_file','patch','execute_code','search_files','skill_view','skill_manage','skills_list','memory','browser_exec','browser_vault_list','browser_vault_fill','browser_vault_save_login','browser_vault_enter_code','browser_vault_unlock','web_extract','vision_analyze','text_to_speech','clarify','delegate_task','tool_call','tool_describe','hermes_tool_search','parallel','run','web_search','session_search','todo_list','process_manage']);
function toolName(value: unknown) {
  if (typeof value !== 'string') return 'unknown_tool';
  const name = value.replace(/^(?:functions|multi_tool_use|web)\./,'');
  return TOOLS.has(name) ? name : 'unknown_tool';
}
function fingerprint(path: string) { const s=statSync(path); if(!s.isFile()) throw Error('Not a database file'); return `${realpathSync(path)}:${s.dev}:${s.ino}:${s.birthtimeMs}`; }
/** Opt-in, explicitly bound session metadata. Never selects message content,
 * reasoning, arguments, output, auth, provider configuration or account data.
 * This is an independent source, not an Armis dispatcher/authority substitute. */
export class HermesMetadata {
  private readonly db: DatabaseSync;
  private readonly path: string;
  private readonly sessionId: string;
  private readonly fingerprint: string;
  readonly epoch: string;
  readonly kind = 'hermes-metadata';
  constructor(path: string, sessionId: string) {
    if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(sessionId)) throw Error('Explicit session binding required');
    this.path=path; this.sessionId=sessionId; this.fingerprint=fingerprint(path);
    this.epoch=createHash('sha256').update(this.fingerprint+':'+sessionId+':'+randomBytes(32).toString('hex')).digest('hex');
    this.db=new DatabaseSync(path,{readOnly:true});
    try { this.read(0,10000,true); } catch(e) {this.db.close();throw e;}
  }
  read(after: number, limit: number, snapshot=false): { observations: RuntimeEvent[]; cursor: number } {
    if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>10000) throw Error('Invalid cursor or bound');
    if(fingerprint(this.path)!==this.fingerprint) throw Error('Metadata database replaced');
    this.db.exec('BEGIN');
    try {
      const session=this.db.prepare('SELECT id,profile_name,started_at,model FROM sessions WHERE id=?').get(this.sessionId);
      if(!session||session.profile_name!=='default'||typeof session.started_at!=='number'||!Number.isFinite(session.started_at)||session.started_at<0) throw Error('Installed default profile binding not verified');
      // Project tool names inside SQLite: raw JSON tool arguments never leave the database query.
      const rows=this.db.prepare(`
        SELECT m.id,m.timestamp,CAST(j.key AS INTEGER) ordinal,'started' phase,
          json_extract(j.value,'$.id') callId,
          COALESCE(json_extract(j.value,'$.function.name'),json_extract(j.value,'$.name')) tool
        FROM messages m JOIN json_each(CASE WHEN json_valid(m.tool_calls) AND length(m.tool_calls)<=1048576 THEN m.tool_calls ELSE '[]' END) j
        WHERE m.session_id=? AND m.role='assistant' AND m.id>=?
        UNION ALL
        SELECT m.id,m.timestamp,63 ordinal,'returned' phase,m.tool_call_id callId,m.tool_name tool
        FROM messages m WHERE m.session_id=? AND m.role='tool' AND m.tool_call_id IS NOT NULL AND m.id>=?
        ORDER BY id,ordinal LIMIT ?`).all(this.sessionId,Math.floor(after/64),this.sessionId,Math.floor(after/64),limit+1);
      const observations: RuntimeEvent[]=[];
      const taskId=null, workerId='hermes.default';
      const event=(cursor:number,type:RuntimeEvent['type'],at:number,attemptId:string|null,data:Record<string,unknown>):RuntimeEvent=>({version:1,mode:'live',eventId:`hermes:${cursor}`,cursor,source:'hermes-metadata',type,occurredAt:at,businessId:'armis',workerId,taskId,attemptId,sessionId:this.sessionId,mandateId:null,data});
      if(after<1) observations.push(event(1,'source.connected',Math.round(session.started_at*1000),null,{}));
      for(const row of rows) {
        const ordinal=Number(row.ordinal),messageId=Number(row.id),cursor=messageId*64+ordinal;
        if(!Number.isSafeInteger(cursor)||cursor<2||ordinal<0||ordinal>63||!Number.isFinite(Number(row.timestamp))||Number(row.timestamp)<0) throw Error('Invalid metadata sequence');
        if(cursor<=after) continue;
        if(typeof row.callId!=='string'||!row.callId||row.callId.length>512) throw Error('Invalid tool identity');
        const attemptId=null; // A tool request is not an independently executed worker/job.
        const data:Record<string,unknown>={tool:toolName(row.tool),phase:row.phase==='started'?'requested':'returned'};
        // This label is requested/configured session metadata, never verified actual model/provider.
        if(typeof session.model==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(session.model)&&!/(?:\bsk-|AIza|gh[pousr]_|token|secret)/i.test(session.model)) data.requestedModel=session.model;
        observations.push(event(cursor,'attempt.activity',Math.round(Number(row.timestamp)*1000),attemptId,data));
      }
      if(snapshot&&observations.length>10000) throw Error('Snapshot exceeds bound');
      const batch=observations.slice(0,limit),cursor=batch.at(-1)?.cursor??after;
      this.db.exec('COMMIT');
      return {observations:batch,cursor};
    } catch(e) {this.db.exec('ROLLBACK');throw e;}
  }
  close(){this.db.close();}
}
