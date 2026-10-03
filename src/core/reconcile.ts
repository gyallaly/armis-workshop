import { BUSINESS_BY_ID, DEPARTMENT_BY_ID, ROSTER } from './config';
import { ORGANIZATION_ROLES } from './organization';
import { businessCounts, displayStatus } from './selectors';
import type { WorkshopState } from './types';

export interface CityIssue { code: string; entityId: string; businessId?: string; message: string }
/** Read-only diagnostics. Inconsistencies remain visible rather than being guessed away. */
export function reconcileCity(state: WorkshopState): CityIssue[] {
  const issues: CityIssue[] = [];
  const add = (code: string, entityId: string, message: string, businessId?: string) => issues.push({code,entityId,message,businessId});
  for (const expected of ROSTER) {
    const w = state.workers[expected.id];
    if (!w) { add('missing-agent',expected.id,'Declared agent is missing from the city.',expected.businessId); continue; }
    if (w.businessId !== expected.businessId || w.homeDepartmentId !== expected.homeDepartmentId || w.reportsTo !== expected.reportsTo)
      add('identity-mismatch',w.id,'Home building, responsibility or reporting line differs from Control.',expected.businessId);
    if (!DEPARTMENT_BY_ID[w.homeDepartmentId] || DEPARTMENT_BY_ID[w.homeDepartmentId]?.businessId !== w.businessId)
      add('invalid-home',w.id,'Home workspace does not belong to this building.',w.businessId);
  }
  for (const w of Object.values(state.workers)) if (!ORGANIZATION_ROLES.some(r => r.id === w.id) && !(['armis.operator','armis.auditor','armis.finance-analyst','armis.evaluator','armis.prompt-engineer','hermes.default'].includes(w.id) && w.installation?.observed)) add('undeclared-agent',w.id,'Identity is absent from the inspected Control registry.',w.businessId);
  for (const st of Object.values(state.statuses)) {
    const w = state.workers[st.workerId];
    if (!w) { add('orphan-status',st.workerId,'Observation has no declared character.'); continue; }
    if (DEPARTMENT_BY_ID[st.departmentId]?.businessId !== w.businessId) add('invalid-location',w.id,'Observed workspace is outside the agent’s home building.',w.businessId);
    if (st.taskId) {
      const task = state.tasks[st.taskId];
      if (!task) add('orphan-job',w.id,'Observed job is missing.',w.businessId);
      else if (task.businessId !== w.businessId || (task.assignedWorkerId && task.assignedWorkerId !== w.id) || (st.state === 'active' && task.assignedWorkerId !== w.id)) add('assignment-mismatch',w.id,'Observed job ownership and worker assignment disagree.',w.businessId);
    }
    if (st.attemptId && (!state.attempts[st.attemptId] || state.attempts[st.attemptId]?.workerId !== w.id || state.attempts[st.attemptId]?.taskId !== st.taskId))
      add('attempt-mismatch',w.id,'Observed attempt does not match this worker and job.',w.businessId);
  }
  for (const task of Object.values(state.tasks)) {
    if (!BUSINESS_BY_ID[task.businessId]) add('orphan-business',task.id,'Job belongs to an unknown building.',task.businessId);
    if (task.assignedWorkerId && state.workers[task.assignedWorkerId]?.businessId !== task.businessId) add('orphan-assignment',task.id,'Assigned agent is missing or belongs to another company.',task.businessId);
    for (const id of task.attemptIds) if (state.attempts[id]?.taskId !== task.id) add('orphan-attempt',task.id,'Job references a missing or unrelated attempt.',task.businessId);
  }
  for (const attempt of Object.values(state.attempts)) if (!state.tasks[attempt.taskId] || !state.workers[attempt.workerId]) add('orphan-execution',attempt.id,'Attempt has no matching job or agent.');
  for (const id of Object.keys(BUSINESS_BY_ID)) {
    const c = businessCounts(state,id);
    const waiting = Object.values(state.workers).filter(w => w.businessId === id && ['waiting_provider','waiting_approval','failed'].includes(displayStatus(state,w).state)).length;
    if (c.active + c.idle + c.offline + c.unknown + waiting !== c.roster) add('count-mismatch',id,'Agent status totals do not match the declared roster.',id);
  }
  return issues;
}

/** Sessions are executions, not extra agents. Only fresh, observed session identities count. */
export function observedSessions(state: WorkshopState, businessId: string): number {
  return new Set(Object.values(state.workers).filter(w => w.businessId === businessId).flatMap(w => {
    const d = displayStatus(state,w);
    return !d.stale && !['idle','offline','unknown'].includes(d.state) && d.status?.sessionId && d.status.sessionId !== 'unknown-session' ? [d.status.sessionId] : [];
  })).size;
}
