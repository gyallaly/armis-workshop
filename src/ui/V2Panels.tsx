import { useEffect, useState } from 'react';
import { BUSINESSES } from '../core/config';
import { businessCounts } from '../core/selectors';
import { CapacityPanel } from './CapacityPanel';
import { useUi, useWorkshop, store } from './store';
import { useV2, v2 } from './v2Store';
import './v2.css';

export function CompanyControls({ businessId }: { businessId: string }) {
  const control = useV2();
  const company = control.companies[businessId];
  const enabled = control.capabilities.companyControl && !control.busy;
  if (!company) return null;
  return <section className="company-control" aria-label="Company operating controls">
    <div className="v2-kicker">OWNER POLICY {control.source === 'demo' ? '· SIMULATED' : ''}</div>
    <div className="company-control__title"><strong>{control.source === 'live' && !control.capabilities.companyControl || company.lifecycle === 'unknown' ? 'Operating state unverified' : company.lifecycle === 'draining' ? 'Paused · finishing current work' : company.lifecycle[0]!.toUpperCase() + company.lifecycle.slice(1)}</strong><span>rev {control.revision}</span></div>
    <div className="company-control__actions">
      <button className="btn btn--sm" disabled={!enabled || company.lifecycle !== 'running'} onClick={() => void v2.command('company.pause', businessId)}>Pause new work</button>
      <button className="btn btn--sm v2-danger" disabled={!enabled || company.lifecycle === 'stopped'} onClick={() => void v2.command('company.stop', businessId)}>Shut down</button>
      <button className="btn btn--sm" disabled={!enabled || company.lifecycle === 'running'} onClick={() => void v2.command('company.resume', businessId)}>Resume company</button>
    </div>
    <p className="small muted">{control.source === 'demo' ? 'Shutdown cancels simulated attempts, holds their jobs and blocks new work. Other companies continue.' : !enabled ? 'Mini has not verified company execution gates. Controls cannot claim a shutdown.' : 'Policy receipt and observed cancellation determine when shutdown is complete.'}</p>
  </section>;
}

function AllocationRow({ businessId }: { businessId: string }) {
  const control = useV2();
  const policy = control.companies[businessId]!;
  const [weight, setWeight] = useState(policy.weight);
  const [max, setMax] = useState(policy.maxConcurrent);
  const [tokenLimit, setTokenLimit] = useState(policy.tokenLimit == null ? '' : String(policy.tokenLimit));
  const [requestLimit, setRequestLimit] = useState(policy.requestLimit == null ? '' : String(policy.requestLimit));
  const [spendLimit, setSpendLimit] = useState(policy.spendLimitMicros == null ? '' : String(policy.spendLimitMicros));
  const [routes, setRoutes] = useState<string[] | null>(policy.allowedProviders ?? null);
  const state = useWorkshop((s) => s);
  const usage = control.source === 'demo' ? store.demo?.companyUsage(businessId) : policy;
  const usageReported = control.source === 'demo' || policy.usageProvenance !== undefined && policy.usageProvenance !== 'unreported';
  const providers = [...new Set(Object.values(state.capacity).map((c) => c.provider))];
  const nullable = (value: string) => value.trim() === '' ? null : Number(value);
  const allocation = { weight, maxConcurrent: max, tokenLimit: nullable(tokenLimit), requestLimit: nullable(requestLimit), spendLimitMicros: control.source === 'demo' ? null : nullable(spendLimit), allowedProviders: routes };
  const changed = weight !== policy.weight || max !== policy.maxConcurrent || allocation.tokenLimit !== (policy.tokenLimit ?? null) || allocation.requestLimit !== (policy.requestLimit ?? null) || allocation.spendLimitMicros !== (policy.spendLimitMicros ?? null) || JSON.stringify(routes) !== JSON.stringify(policy.allowedProviders ?? null);
  const valid = [allocation.tokenLimit, allocation.requestLimit, allocation.spendLimitMicros].every((n) => n === null || Number.isSafeInteger(n) && n >= 0);
  const exhausted = allocation.tokenLimit !== null && usage?.consumedTokens !== undefined && allocation.tokenLimit <= usage.consumedTokens || allocation.requestLimit !== null && usage?.consumedRequests !== undefined && allocation.requestLimit <= usage.consumedRequests;
  const counts = businessCounts(state, businessId);
  const business = BUSINESSES.find((b) => b.id === businessId)!;
  const observedPolicy = control.source === 'demo' || policy.lifecycle !== 'unknown';
  const operational = control.source === 'demo' || control.capabilities.allocations;
  return <article className="allocation-card">
    <div className="allocation-card__title"><strong>{business.brand.displayName}</strong><span className="v2-chip">{control.source === 'live' && !control.capabilities.companyControl ? 'unverified' : policy.lifecycle}</span></div>
    <p className="small muted">{operational ? `${counts.active} working · ${counts.queued} queued · effective share ${policy.weight} · ceiling ${policy.maxConcurrent}` : observedPolicy ? `Requested share ${policy.weight} · ceiling ${policy.maxConcurrent}. Effective allocation and execution are unverified.` : 'Allocation and execution are not reported.'}</p>
    <label className="allocation-field">Scheduling weight <output>{observedPolicy ? weight : 'Not reported'}</output><input aria-label={`${business.brand.displayName} scheduling weight`} type="range" min="0" max="100" value={weight} disabled={!control.capabilities.allocations} onChange={(e) => setWeight(Number(e.target.value))} /></label>
    <label className="allocation-field">Concurrent attempts <input aria-label={`${business.brand.displayName} concurrent attempts`} type="number" min="0" max={businessId === 'uditus' ? 1 : 12} placeholder="Not reported" value={observedPolicy ? max : ''} disabled={!control.capabilities.allocations} onChange={(e) => setMax(Number(e.target.value))} /></label>
    {businessId === 'uditus' ? <p className="small muted">Uditus stays serialized: one attempt at a time.</p> : null}
    <fieldset className="usage-ceilings" disabled={!control.capabilities.allocations}><legend>Owner usage ceilings</legend><p className="small muted">{control.source === 'demo' ? 'Cumulative within this simulation epoch. Reset / scenario change starts a new counter epoch and preserves owner limits and shutdowns.' : 'Cumulative until policy reset.'} Blank means unbounded; zero blocks usage. No automatic subscription reset is assumed.</p>
      <label className="allocation-field">Token ceiling <input aria-label={`${business.brand.displayName} token ceiling`} type="number" placeholder="Unbounded" min="0" step="1" value={tokenLimit} onChange={(e) => setTokenLimit(e.target.value)} /></label>
      <label className="allocation-field">Request ceiling <input aria-label={`${business.brand.displayName} request ceiling`} type="number" placeholder="Unbounded" min="0" step="1" value={requestLimit} onChange={(e) => setRequestLimit(e.target.value)} /></label>
      <label className="allocation-field">Spend ceiling (USD micros) <input aria-label={`${business.brand.displayName} spend ceiling`} type="number" placeholder={control.source === 'demo' ? 'Unreported' : 'Unbounded'} min="0" step="1" value={spendLimit} disabled={control.source === 'demo'} onChange={(e) => setSpendLimit(e.target.value)} /></label>
      <p className="small muted">Consumed: {usageReported ? usage?.consumedTokens ?? 'unreported' : 'unreported'} tokens · {usageReported ? usage?.consumedRequests ?? 'unreported' : 'unreported'} requests{control.source === 'live' ? ` · ${usageReported ? policy.consumedCostMicros ?? 'unreported' : 'unreported'} USD micros · ${policy.usageProvenance?.replaceAll('_',' ') ?? 'unreported'}` : '. Spend enforcement unavailable in simulation: comparable cost is not measured.'}</p>
      <p className="small muted">1 USD = 1,000,000 micros. Running reservations count toward live ceilings.</p>
    </fieldset>
    <fieldset className="usage-ceilings" disabled={!control.capabilities.allocations}><legend>Allowed provider routes</legend><label className="provider-route"><input type="checkbox" checked={routes === null} onChange={(e) => setRoutes(e.target.checked ? null : providers)} />All configured routes</label>{providers.map((provider) => <label className="provider-route" key={provider}><input type="checkbox" checked={routes === null || routes.includes(provider)} onChange={(e) => { const selected = routes ?? providers; setRoutes(e.target.checked ? [...new Set([...selected,provider])] : selected.filter((p) => p !== provider)); }} />{provider}</label>)}{!providers.length ? <p className="small muted">Provider route IDs not reported.</p> : null}</fieldset>
    <p className="small muted">{!operational ? 'Execution gates have not been verified. No effective admission behavior is claimed.' : weight === 0 || max === 0 ? 'New admissions will be blocked. Current attempts finish.' : `Up to ${max} simultaneous attempts; existing attempts retain their reservation.`}</p>
    {exhausted ? <p className="v2-callout">This cumulative ceiling is already reached. Future calls are held; already incurred usage is preserved.</p> : null}
    {!valid ? <p className="v2-error">Usage ceilings require whole, nonnegative amounts.</p> : null}
    <button className="btn btn--sm" disabled={!control.capabilities.allocations || control.busy || !changed || !valid} onClick={() => void v2.command('allocation.set', businessId, allocation)}>Apply allocation</button>
    <CompanyControls businessId={businessId} />
  </article>;
}

function OwnerServicesReserve() {
  const control = useV2();
  const reserve = control.ownerReserve;
  const measured = reserve && reserve.usageProvenance !== undefined && reserve.usageProvenance !== 'unreported';
  return <article className="allocation-card owner-reserve"><div className="v2-kicker">SEPARATE SHARED RESERVE</div><h3>Owner services · Hermes conversation</h3><p className="small muted">Owner conversation does not belong to HQ’s company budget. Shutting down HQ leaves this reserve available. Global AI stop fences it too.</p><dl className="kv"><dt>Concurrency reserve</dt><dd>{reserve?.maxConcurrent ?? 'Not reported'}</dd><dt>Outstanding calls</dt><dd>{reserve?.activeReservations ?? 'Not reported'}</dd><dt>Consumed tokens / requests</dt><dd>{measured ? `${reserve.consumedTokens ?? 'unreported'} / ${reserve.consumedRequests ?? 'unreported'}` : 'Not reported'}</dd><dt>Consumed USD micros</dt><dd>{measured ? reserve.consumedCostMicros ?? 'Not reported' : 'Not reported'}</dd><dt>Global AI policy</dt><dd>{control.globalStopped === undefined ? 'Unverified' : control.globalStopped ? 'Stopped' : 'Admission open'}</dd></dl><p className="small muted">{control.source === 'demo' ? 'The local status assistant calls no model: zero inference tokens and provider requests. This reserve is illustrative.' : 'Reserve measurements come from the authenticated owner service; subscription entitlement is separate.'}</p></article>;
}

export function PowerPanel() {
  const [reactor,setReactor]=useState<string>();
  useEffect(()=>{
    const select=(event:Event)=>{setReactor((event as CustomEvent<string>).detail);setTab('providers');};
    window.addEventListener('armis:reactor-select',select);
    return ()=>window.removeEventListener('armis:reactor-select',select);
  },[]);
  const [tab, setTab] = useState<'providers' | 'allocations' | 'machine' | 'efficiency'>('providers');
  const control = useV2();
  const state = useWorkshop((s) => s);
  const known = Object.values(state.capacity).filter((c) => c.availability.value === 'available' || c.availability.value === 'limited').length;
  return <section className="detail v2-power"><div className="v2-kicker">THE CORE · COMPUTING CONTROL</div><h2 className="panel__h">Power station</h2><p className="small muted">{control.source === 'demo' ? 'Simulated supply and owner policy' : 'Observed supply · verified controls only'} · {known} available / {Object.keys(state.capacity).length} configured scopes</p>
    <div className="v2-subtabs" aria-label="Power station sections">{(['providers','allocations','machine','efficiency'] as const).map((id) => <button key={id} aria-pressed={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>{id[0]!.toUpperCase() + id.slice(1)}</button>)}</div>
    {tab === 'providers' ? <><div className="core-provider-select" aria-label="Reactor selection"><button className="btn btn--sm" aria-pressed={!reactor} onClick={()=>setReactor(undefined)}>All reactors</button>{Object.values(state.capacity).map(c=><button key={c.id} className="btn btn--sm" aria-pressed={reactor===c.id} onClick={()=>setReactor(c.id)}>{c.provider} reactor</button>)}</div><p className="v2-callout">Reactors represent provider accounts, not the Mini’s GPU. Remaining allowance stays unknown unless the source reports it. Request counts and token counts are different units.</p><CapacityPanel capacityId={reactor&&state.capacity[reactor]?reactor:undefined} /></> : null}
    {tab === 'allocations' ? <><p className="v2-callout">Weights are scheduling priorities, not purchased quota. Zero weight or zero concurrency blocks new work. Reducing capacity does not erase already running requests.</p><OwnerServicesReserve />{BUSINESSES.map((b) => <AllocationRow key={`${b.id}-${control.revision}`} businessId={b.id} />)}<div className="v2-global"><button className="btn v2-danger" disabled={!control.capabilities.companyControl || control.busy} onClick={() => void v2.command('global.stop')}>Stop all managed AI</button><button className="btn" disabled={!control.capabilities.companyControl || control.busy} onClick={() => void v2.command('global.resume')}>Resume all companies</button><p className="small muted">Control and status services remain available.</p></div></> : null}
    {tab === 'machine' ? <><h3>Mac Mini resources</h3><div className="machine-grid">{['CPU','Memory','Disk','GPU / local inference'].map((s) => <div key={s}><span>{s}</span><strong>Not reported</strong></div>)}</div><p className="v2-callout">Cloud model calls do not imply local GPU work. No hardware collector has supplied measurements to this viewer. Browser rendering is separate from agent computation.</p></> : null}
    {tab === 'efficiency' ? <><h3>Outcomes before scores</h3><div className="machine-grid"><div><span>Recorded ready jobs</span><strong>{Object.values(state.tasks).filter((t) => t.status === 'ready').length}</strong></div><div><span>Recorded failed attempts</span><strong>{Object.values(state.attempts).filter((a) => a.outcome === 'failed').length}</strong></div></div><p className="v2-callout">These are {control.source === 'demo' ? 'simulated ' : ''}counts within the bounded observation history, not an efficiency rating. Accepted quality, comparable token/cost attribution and a measurement window are required for a trustworthy score.</p></> : null}
    {control.error ? <p className="v2-error" role="alert">{control.error}</p> : null}
    {control.receipts.length ? <section className="v2-receipts"><h3>Command receipts</h3>{control.receipts.slice(-4).reverse().map((r) => <article key={r.id}><strong>{r.type.replaceAll('.', ' ')} · {r.state}</strong><p>{r.reason ?? 'Awaiting authoritative reconciliation'}</p><code>{r.id}</code></article>)}</section> : null}
  </section>;
}

const signals = [
  ['Blue supply pipe','Connects a provider source to the campus. A wider branch means a larger effective scheduling allocation; it is not a quota guarantee.'],
  ['Moving light in a pipe','Recent confirmed execution using that supply. A quiet pipe means no recent activity, not necessarily disconnection.'],
  ['Reactor fill','Remaining allowance for a reported quota window. If no comparable total is reported, no percentage is invented.'],
  ['Amber reactor warning','The provider reports limited capacity, cooling down or a verified low allowance. Inspect it for the reason.'],
  ['Red reactor fault','The provider reports unavailable or exhausted allowance. The panel distinguishes failure from quota exhaustion when evidence exists.'],
  ['Critical quota warning','A fresh comparable allowance at or below 10% has a red warning beacon. This means nearly exhausted; a zero allowance or provider failure is a fault.'],
  ['Neutral reactor / unknown gauge','The provider has no fresh allowance or availability evidence. It does not mean a full tank.'],
  ['Building perimeter lights','Effective permitted operating capacity. A small allocation dims the supply lights; a very small allocation can briefly interrupt a perimeter lamp. This is an allocation cue, not a provider fault or a worker state change. Reduced motion keeps the lights steady. Lights do not measure remaining subscription quota.'],
  ['Dark branch / stopped building','Owner policy has stopped that company and cancellation is confirmed in the simulation or by a live receipt. Unknown telemetry never proves stopped.'],
  ['Lit workstation','An agent is confirmed working. Its document opens the assigned job and recorded criteria.'],
  ['Agent in the lounge','Confirmed idle/resting state, or a muted declared identity with no observation. Inspect its state to tell the difference.'],
  ['Waiting marker','An agent or job is blocked on a provider, approval or policy. Waiting is different from working.'],
  ['Document progress / review / failure','Recorded acceptance criteria, review state or failed attempt. Missing progress has no invented percentage.'],
  ['Short delegation pulse','A recorded assignment or handoff. Demo supervisor pulses are simulated. No decorative pedestrians imply work.'],
  ['Green connection','Fresh positive evidence for that specific feed. An empty healthy feed can report zero.'],
  ['Red connection','Missing, stale, unavailable or unverified feed. It does not automatically mean the agents stopped.'],
  ['Demo / Live badges','Demo is deterministic simulated data. Live shows only validated observations; missing values remain unreported.'],
  ['Pause / Shut down / Resume','Pause stops new admissions while current work finishes. Shutdown cancels owned work and reconciles usage. Resume deliberately reopens admission.'],
  ['Requested / effective receipt','A command being requested is not proof it worked. Only effective policy and reconciled execution justify success.'],
  ['First-floor cutaway','The building you selected opens in place. Its upper floors dissolve so its actual workspaces remain connected to the campus.'],
];
export function GuidePanel() { return <section className="detail guide"><div className="v2-kicker">READ THE CITY</div><h2 className="panel__h">What everything means</h2><p className="v2-callout">Every operational light should have a reason. Architecture is illustrative; work, usage and controls follow evidence. Click an object to inspect it.</p>{signals.map(([title, explanation]) => <article key={title}><h3>{title}</h3><p>{explanation}</p></article>)}</section>; }

export function HermesChat() {
  const control = useV2();
  const [text, setText] = useState('');
  const selection = useUi((s) => s.selection);
  return <section className={`hermes-chat ${control.chatOpen ? 'is-open' : ''}`} aria-label="Hermes conversation">
    <button className="hermes-chat__head" aria-expanded={control.chatOpen} onClick={() => v2.update({ chatOpen: !control.chatOpen })}><span className="hermes-chat__orb">H</span><span><strong>Talk to Hermes</strong><small>{control.recipient}</small></span><span>{control.chatOpen ? '−' : '+'}</span></button>
    {control.chatOpen ? <><div className="hermes-chat__messages" aria-live="polite">{!control.messages.length ? <p className="small muted">{control.source === 'demo' ? 'Local simulated status assistant. Messages never reach the Mini.' : control.capabilities.chat ? 'Authenticated conversation with the installed Hermes recipient.' : 'Hermes transport is not verified. Sending is disabled until the Mini advertises a working capability.'}</p> : control.messages.map((m) => <article className={`chat-message chat-message--${m.role}`} key={m.id}><span>{m.role === 'owner' ? 'You' : 'Hermes'} · {m.state}</span><p>{m.text}</p></article>)}</div>{selection ? <div className="chat-context">Context: {selection.kind}{'id' in selection ? ` · ${selection.id}` : ''}</div> : null}{control.error ? <p className="v2-error" role="alert">{control.error}</p> : null}<form className="hermes-chat__composer" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { void v2.chat(text); setText(''); } }}><label className="sr-only" htmlFor="hermes-message">Message Hermes</label><textarea id="hermes-message" placeholder="Ask what’s happening…" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={2} disabled={!control.capabilities.chat} /><button className="btn" disabled={!control.capabilities.chat || !text.trim()}>Send</button></form></> : null}
  </section>;
}
