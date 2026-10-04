import { useSyncExternalStore } from 'react';
import { configuredBridgeUrl, nativeSessions } from '../adapters/live';
import { NativeSessionsPanel } from './NativeSessionsPanel';
import { diagnostics, FEEDS, feedWorking } from '../core/connections';
import { useWorkshop } from './store';
import './connections.css';

const time = (at:number|null) => at===null ? 'Never observed' : new Date(at).toLocaleTimeString();
export function ConnectionsPanel() {
  const state=useWorkshop(s=>s);
  const d=useSyncExternalStore(diagnostics.subscribe,diagnostics.get);
  const sessions=useSyncExternalStore(nativeSessions.subscribe,nativeSessions.get,nativeSessions.get);
  const now=Date.now();
  const live=state.connection==='connected' && d.lastValidAt!==null && now-d.lastValidAt<=90000;
  const url=configuredBridgeUrl();
  const endpoint=url ? new URL(url).origin : 'No endpoint configured';
  const working=FEEDS.filter(([id])=>feedWorking(d.feeds[id],live,now)).length;
  return <section className="connections" aria-label="Mac mini connections">
    <h2>Mac mini connections</h2>
    <p>Green means a fresh successful source check over a validated live stream. Red means disconnected, stale, failed, or unverified.</p>
    {state.connection==='demo' ? <p className="connections__notice">Demo is selected. Simulated activity does not verify any Mac connection.</p> : null}
    <div className={`connection-row ${live?'connection-row--ok':'connection-row--bad'}`}>
      <strong><span aria-hidden="true">● </span>Mac → Workshop stream</strong>
      <span>{live?'Working':!url?'Not configured':state.connection==='demo'?'Not monitored in Demo':state.connection==='reconnecting'?'Reconnecting / unconfirmed':'Disconnected / stale'}</span>
      <small>{endpoint}</small>
      <dl><dt>Accepted snapshots</dt><dd>{d.acceptedSnapshots}</dd><dt>Accepted events</dt><dd>{d.acceptedEvents}</dd><dt>Rejected messages</dt><dd>{d.rejectedMessages}</dd><dt>Duplicate events ignored</dt><dd>{state.connection==='demo'?'Live unobserved':state.stats.duplicates}</dd><dt>Out-of-order events</dt><dd>{state.connection==='demo'?'Live unobserved':state.stats.outOfOrder}</dd><dt>Last received</dt><dd>{time(d.lastMessageAt)}</dd><dt>Last valid data</dt><dd>{time(d.lastValidAt)}</dd></dl>
      {d.lastError ? <small>{d.lastError}</small> : null}
    </div>
    <p className="mono">{working} / {FEEDS.length} feeds verified</p>
    <NativeSessionsPanel data={sessions} now={now} live={live}/>
    {d.observedJournalRecords>0 ? <section aria-label="Runtime projection evidence"><h3>What arrived from the runtime</h3><p>{d.observedJournalRecords} source records · {d.unmappedObservations} without a compatible city visual · {d.unboundObservations} with an unbound runtime role.</p><p className="muted">Unbound roles are not silently turned into city agents. Records without enough detail remain visible here; a task result does not imply accepted work or remaining provider allowance.</p><details><summary>Inspect recent source evidence ({d.journalEvidence.length})</summary>{d.journalEvidence.slice().reverse().map((e)=><article key={e.id} className="connection-row"><strong>{e.type}</strong><small>{e.source} · {time(e.at)}</small><small>{e.reason}</small><small>{[e.role,e.taskId,e.attemptId,e.sessionId,e.artifactId].filter(Boolean).join(' · ')||'No role or job attribution reported'}</small>{e.model?<small>Observed model: {e.model}</small>:null}{e.inputTokens!==undefined||e.outputTokens!==undefined?<small>Recorded tokens: {e.inputTokens??'unreported'} input / {e.outputTokens??'unreported'} output</small>:null}{e.costMicros!==undefined?<small>Recorded cost: {e.costMicros} micro-units · provenance {e.costProvenance??'unreported'}</small>:null}</article>)}</details></section>:null}
    <div aria-label="Source feed status">
      {FEEDS.map(([id,name,description])=> {
        const r=d.feeds[id];
        const ok=feedWorking(r,live,now);
        const statusLabels={error:'Source error',not_configured:'Not configured',missing_access:'Missing access',unsupported:'Unsupported',stale:'Stale source',not_applicable:'Not applicable',blocked:'Blocked',partial:'Degraded / partial',ok:'Stale check'};
        const label=ok?'Working':!live?'Not connected':!r?'Not reported':now-r.checkedAt>45000?'Stale check':statusLabels[r.status];
        return <article key={id} className={`connection-row ${ok?'connection-row--ok':'connection-row--bad'}`} aria-label={`${name}: ${label}`}>
          <div className="connection-row__head"><strong><span aria-hidden="true">● </span>{name}</strong><span>{label}</span></div>
          <small>{description}</small>
          {r ? <><small>Checked {time(r.checkedAt)} · {r.records} records reported</small><small>Last record: {time(r.lastRecordAt)}</small><small>{r.detail}</small></> : <small>No live source report received.</small>}
        </article>;
      })}
    </div>
    <p className="muted">A healthy quiet feed can report zero records. A connected stream alone never turns its sources green. Source checks expire after 45 seconds.</p>
    <p className="muted">The installed updater runs readiness checks automatically. Unverified connections remain visible until the Mini supplies fresh evidence.</p>
  </section>;
}
