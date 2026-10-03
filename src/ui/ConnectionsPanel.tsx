import { useSyncExternalStore } from 'react';
import { configuredBridgeUrl } from '../adapters/live';
import { diagnostics, FEEDS, FEED_SCOPE, feedWorking } from '../core/connections';
import { useWorkshop } from './store';
import './connections.css';

const time = (at:number|null) => at===null ? 'Never observed' : new Date(at).toLocaleTimeString();
export function ConnectionsPanel() {
  const state=useWorkshop(s=>s);
  const d=useSyncExternalStore(diagnostics.subscribe,diagnostics.get);
  const now=Date.now();
  const live=state.connection==='connected' && d.lastValidAt!==null && now-d.lastValidAt<=90000;
  const url=d.endpoint??configuredBridgeUrl();
  const endpoint=url ? new URL(url,window.location.href).origin+new URL(url,window.location.href).pathname : 'No endpoint configured';
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
    <div aria-label="Source feed status">
      {FEEDS.map(([id,name,description])=> {
        const r=d.feeds[id];
        const ok=feedWorking(r,live,now);
        const labels={error:'Source error',not_configured:'Not configured',missing_access:'Missing access',unsupported:'Unsupported',stale:'Stale',not_applicable:'Not applicable',blocked:'Blocked',partial:'Partial / unknown',ok:'Stale check'};
        const label=ok?'Working':!live?'Not connected':!r?'Not reported':r.status==='ok'?'Stale check':labels[r.status];
        return <article key={id} className={`connection-row ${ok?'connection-row--ok':'connection-row--bad'}`} aria-label={`${name}: ${label}`}>
          <div className="connection-row__head"><strong><span aria-hidden="true">● </span>{name}</strong><span>{label}</span></div>
          <small>{description} · {FEED_SCOPE[id]} for current Armis/Uditus</small>
          {r?.source?<small>Source: {r.source}</small>:null}
          {r ? <><small>Checked {time(r.checkedAt)} · {r.records} records reported</small><small>Last record: {time(r.lastRecordAt)}</small><small>{r.detail}</small></> : <small>No live source report received.</small>}
        </article>;
      })}
    </div>
    <p className="muted">A healthy quiet feed can report zero records. A connected stream alone never turns its sources green. Partial evidence is not availability; not-applicable feeds need no integration. Source checks expire after 45 seconds.</p>
    <a href="/mac-mini-diagnostics.txt" download="armis-mac-diagnostics.txt">Download the single Mac terminal block</a>
  </section>;
}
