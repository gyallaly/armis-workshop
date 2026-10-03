import { ORGANIZATION_ROLES, type ControlRole } from '../adapters/control';
import { BUSINESS_BY_ID } from '../core/config';
import { displayStatus } from '../core/selectors';
import { reconcileCity } from '../core/reconcile';
import { useWorkshop } from './store';
import './organization.css';

function RoleBranch({ role, allowed }: { role: ControlRole; allowed: Set<string> }) {
  const state = useWorkshop(s => s);
  const worker = state.workers[role.id];
  const status = worker ? displayStatus(state,worker) : null;
  const children = ORGANIZATION_ROLES.filter((r) => r.reportsTo === role.id && allowed.has(r.id));
  return (
    <li>
      <details className="org__role">
        <summary><strong>{role.label}</strong><span>{role.kind === 'worker' ? 'Bounded worker' : role.kind.replaceAll('-', ' ')}</span></summary>
        <p>{role.mandate}</p>
        <dl><dt>Identity</dt><dd>{role.id}</dd><dt>Reports to</dt><dd>{role.reportsTo ?? 'Owner'}</dd><dt>Installation</dt><dd>{worker?.installation?.installed === true ? 'Installed (journal verified)' : 'Not verified'}</dd><dt>Execution</dt><dd>{!status || status.reported === null ? 'Unknown / not observed' : status.state}{state.connection === 'demo' ? ' (simulated)' : ''}</dd></dl>
      </details>
      {children.length > 0 && <ul>{children.map((r) => <RoleBranch key={r.id} role={r} allowed={allowed} />)}</ul>}
    </li>
  );
}

/** Policy identities are separate from characters and observed execution. */
export function OrganizationPanel({ businessId }: { businessId: string | null }) {
  const state = useWorkshop(s => s);
  const issues = reconcileCity(state).filter(i => (state.connection === 'demo' || i.code !== 'missing-agent') && (!businessId || !i.businessId || i.businessId === businessId));
  const roles = ORGANIZATION_ROLES.filter((r) => !businessId || r.businessId === businessId);
  const allowed = new Set(roles.map((r) => r.id));
  const roots = roles.filter((r) => !r.reportsTo || !allowed.has(r.reportsTo));
  return (
    <details className="org">
      <summary>Agent organization <span>{roles.length} declared roles</span></summary>
      <div className="org__body">
        <p>{businessId ? BUSINESS_BY_ID[businessId]?.brand.displayName : 'ARMIS Syndicate'} authority structure from ARMIS Control. These roles are declared identities; demo characters do not establish running sessions.</p>
        {!businessId && <p className="org__owner">Owner → ARMIS CEO → business CEOs → coordinators → workers</p>}
        <ul className="org__tree">{roots.map((r) => <RoleBranch key={r.id} role={r} allowed={allowed} />)}</ul>
        <dl className="org__telemetry"><dt>Data source</dt><dd>{state.connection === 'demo' ? 'Demo (simulated)' : state.connection}</dd><dt>City reconciliation</dt><dd>{issues.length ? `${issues.length} inconsistencies` : 'Registry and observed records agree'}</dd><dt>Mandates and ownership allocations</dt><dd>Not reported</dd><dt>Budgets, leases and resource locks</dt><dd>Not observed</dd></dl>
        {issues.length > 0 && <ul>{issues.map((i,index) => <li key={`${i.code}:${i.entityId}:${index}`} className="warn">{i.entityId}: {i.message}</li>)}</ul>}
        <p className="small muted">Persistent identity does not mean active inference. Runtime status appears only after verified telemetry is connected.</p>
      </div>
    </details>
  );
}
