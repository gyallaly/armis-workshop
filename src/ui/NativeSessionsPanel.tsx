import type {NativeSessions} from '../adapters/live';

/** Native execution is evidence, not a new Control identity or acceptance receipt. */
export function NativeSessionsPanel({data,now,live}:{data:NativeSessions;now:number;live:boolean}) {
  const sourceStale=data.observedAt===null||now-data.observedAt>45000||now<data.observedAt-30000;
  return <section aria-label="Native session activity">
    <h3>Native session activity</h3>
    <p>{data.sessionCount} observed sessions · {data.boundRoleCount} explicitly bound roles</p>
    <p className="muted">Sessions are not additional declared Control identities. Independent acceptance: not observed.</p>
    <p className="muted">Only explicitly authorized sessions are visible. Enrollment does not prove a current process or accepted work. Unavailable activity may reflect missing source evidence, expiry or revocation.</p>
    {data.status==='not_reported'?<p>Native sessions: Not reported</p>:data.status==='degraded'?<p>Native sessions: Degraded / current execution unknown</p>:sourceStale?<p>Native sessions: Unknown / stale source</p>:null}
    {data.sessions.map(s=>{
      const stale=sourceStale||s.stale||s.lastUpdate===null||now-s.lastUpdate>=120000||now<s.lastUpdate;
      const state=!live?'Unknown / disconnected':data.status==='degraded'?'Unknown / degraded':s.state==='unavailable'?'Unknown / unavailable':stale?'Unknown / stale':s.taskState;
      return <article key={s.sessionId} className="connection-row" aria-label={`Native session ${s.sessionId}`}>
        <div className="connection-row__head"><strong className="mono">{s.sessionId}</strong><span>{state}</span></div>
        <small>Source state: {s.state} · {s.workerId?`Explicit role binding: ${s.workerId}`:'Unbound session; no declared role assigned'}</small>
        <small>Last recorded step: {s.currentStep}</small>
        <small>Last source update: {s.lastUpdate===null?'Not reported':new Date(s.lastUpdate).toLocaleTimeString()}</small>
        <small>Configured model (not an actual receipt): {s.configuredModel??'Not reported'}</small>
        <small>Actual model: {s.actualModel??'Not reported'}</small>
      </article>;
    })}
  </section>;
}
