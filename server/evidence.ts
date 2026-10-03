import { DatabaseSync } from 'node:sqlite';
import { normalizeEvent } from '../src/core/normalize.ts';

const identifier = (value: unknown): string | null => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value) && !/(?:sk-|AIza|gh[pousr]_|token|secret|password)/i.test(value) ? value : null;
const metric = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
function safeResult(value: unknown): string {
  if (typeof value !== 'string' || value.length > 8192) return 'Unavailable: unsafe or unsupported result text';
  const e = normalizeEvent({id:'result',type:'artifact.recorded',sourceTs:0,receivedTs:0,businessId:'hermes-hq',taskId:'result',payload:{artifact:{id:'result',taskId:'result',kind:'markdown',title:'Recorded internal result',preview:value,recordedAt:0,illustrative:false}}});
  return e ? value : 'Unavailable: unsafe or unsupported result text';
}
/** Explicit setup journal only. SQL selects individual JSON fields, never raw receipts/prompts. */
export class SetupEvidence {
  private db: DatabaseSync;
  constructor(path: string) { this.db = new DatabaseSync(path,{readOnly:true}); }
  read() {
    this.db.exec('BEGIN');
    try {
      const workflows = this.db.prepare(`SELECT id,state,json_extract(result,'$.summary') result,
        json_extract(result,'$.failure.reason') failureReason,json_extract(result,'$.review.passed') reviewPassed,json_array_length(json_extract(result,'$.review.issues')) reviewIssueCount
        FROM workflows ORDER BY rowid DESC LIMIT 30`).all().map(r=>({id:identifier(r.id),state:['completed','held','running'].includes(String(r.state))?String(r.state):'unknown',result:safeResult(r.result),reviewPassed:r.reviewPassed===1?true:r.reviewPassed===0?false:null,reviewIssueCount:metric(r.reviewIssueCount),diagnosticGap:r.state==='held'&&!r.failureReason?'Original failure diagnostic was not retained; no automatic replay':null,released:false as const})).filter(r=>r.id);
      const calls = this.db.prepare(`SELECT id,workflow,phase,role,model,started,state,
        json_extract(receipt,'$.actualProvider') actualProvider,json_extract(receipt,'$.actualModel') actualModel,
        json_extract(receipt,'$.tokens.input') inputTokens,json_extract(receipt,'$.tokens.output') outputTokens,
        json_extract(receipt,'$.runtimeSessionId') runtimeSessionId,json_extract(receipt,'$.durationMs') durationMs,json_extract(receipt,'$.generationRequests') generationRequests,
        json_extract(receipt,'$.failure.reason') failureReason,json_extract(receipt,'$.failure.observedHttpStatus') failureStatus,json_extract(receipt,'$.failure.finishReason') failureFinish,json_extract(receipt,'$.failure.failureCategory') failureCategory
        FROM calls ORDER BY started DESC LIMIT 100`).all().map(r=>({id:identifier(r.id),workflowId:identifier(r.workflow),phase:['operations','execution','review'].includes(String(r.phase))?String(r.phase):'unknown',roleId:identifier(r.role),requestedModel:identifier(r.model),startedAt:metric(r.started),state:['completed','held','running','rejected'].includes(String(r.state))?String(r.state):'unknown',actualProvider:identifier(r.actualProvider),actualModel:identifier(r.actualModel),inputTokens:metric(r.inputTokens),outputTokens:metric(r.outputTokens),runtimeSessionId:identifier(r.runtimeSessionId),durationMs:metric(r.durationMs),generationRequests:metric(r.generationRequests),failure:r.failureReason?{reason:['native-request-held','invalid-native-receipt','operations-output-contract','worker-output-contract','review-output-contract','timeout','cancelled'].includes(String(r.failureReason))?String(r.failureReason):'unknown-runtime-failure',observedHttpStatus:typeof r.failureStatus==='number'&&Number.isInteger(r.failureStatus)&&r.failureStatus>=100&&r.failureStatus<=599?r.failureStatus:null,finishReason:['STOP','MAX_TOKENS','SAFETY','RECITATION','OTHER','BLOCKLIST','PROHIBITED_CONTENT','SPII','MALFORMED_FUNCTION_CALL','UNEXPECTED_TOOL_CALL','FINISH_REASON_UNSPECIFIED'].includes(String(r.failureFinish))?String(r.failureFinish):null,failureCategory:['incomplete-output','provider-rejected','transport-failed'].includes(String(r.failureCategory))?String(r.failureCategory):null}:null})).filter(r=>r.id&&r.workflowId&&r.roleId);
      this.db.exec('COMMIT');
      const held=workflows.filter(w=>w.state==='held').length,completed=workflows.filter(w=>w.state==='completed').length,running=workflows.filter(w=>w.state==='running').length;
      return {state:'connected' as const,source:'durable setup journal',observedAt:Date.now(),executionHealth:{state:running?'running':held?'held':completed?'completed':'unknown',held,completed,running},workflows,calls,diagnostics:this.diagnostics()};
    } catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
  private diagnostics(){
    try{
      const roles=this.db.prepare("SELECT COUNT(DISTINCT json_extract(body,'$.workerId')) roles FROM viewer_events WHERE json_valid(body) AND json_extract(body,'$.type')='source.connected'").get();
      const retrievals=this.db.prepare('SELECT COUNT(*) count,MAX(at) last FROM memory_retrievals').get();
      const cooldowns=this.db.prepare('SELECT model,until FROM cooldown ORDER BY until DESC LIMIT 100').all().map(r=>({model:identifier(r.model),until:metric(r.until)})).filter((r):r is {model:string;until:number}=>r.model!==null&&r.until!==null);
      return {state:'connected' as const,roles:metric(roles?.roles)??0,retrievals:metric(retrievals?.count)??0,lastRetrievalAt:metric(retrievals?.last),cooldowns};
    }catch{return {state:'unsupported' as const,gap:'Role, cooldown or retrieval metadata schema unavailable'};}
  }
  close() {this.db.close();}
}
