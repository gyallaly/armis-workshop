import type { Measured, Provenance, ProviderCapacity } from '../core/types';
import { capacityConsumers, tasksWaitingOn } from '../core/selectors';
import { Icon } from './Icon';
import { ui, useUi, useWorkshop } from './store';
import { clock, relTime } from './format';

const PROV_LABEL: Record<Provenance, string> = {
  provider_reported: 'Provider reported',
  locally_measured: 'Locally measured',
  estimated: 'Estimated',
  unknown: 'Unknown',
};

export function ProvTag({ p }: { p: Provenance }) {
  return <span className={`prov prov--${p}`}>{PROV_LABEL[p]}</span>;
}

function availLabel(a: ProviderCapacity['availability']['value']) {
  return a === 'available' ? 'Available' : a === 'limited' ? 'Limited' : a === 'unavailable' ? 'Unavailable' : 'Unknown';
}

function AvailBadge({ m }: { m: Measured<string> }) {
  const v = (m.value ?? 'unknown') as string;
  const icon = v === 'available' ? 'check' : v === 'unavailable' ? 'close' : v === 'limited' ? 'minus' : 'info';
  return (
    <span className={`avail avail--${v}`}>
      <Icon name={icon} size={13} />
      {availLabel(v as any)}
    </span>
  );
}

function countdown(now: number, at: number | null): string {
  if (at === null) return '-';
  const s = Math.max(0, Math.round((at - now) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(ss).padStart(2, '0')}`;
}

export function CapacityPanel({capacityId}:{capacityId?:string}={}) {
  const state = useWorkshop((s) => s);
  const caps = Object.values(state.capacity).filter(c=>!capacityId||c.id===capacityId);
  const demo = useUi(s => s.prefs.source === 'demo');
  return (
    <section className="cap" aria-labelledby="cap-h">
      <h2 id="cap-h" className="panel__h">
        AI provider capacity
      </h2>
      <p className="note">
        Capacity is tracked per provider scope and shared by every worker on that scope - it is never split into per-worker allowances. Remaining
        allowance is shown only when the provider reports it.
        {demo ? <strong> Demo values and model ids are illustrative; no provider is called.</strong> : null}
      </p>
      {!caps.length ? <p className="empty">No capacity data. {state.connection === 'disconnected' ? 'Live bridge not connected.' : ''}</p> : null}
      {caps.map((c) => {
        const users = capacityConsumers(state, c.id);
        const waiting = tasksWaitingOn(state, c.id);
        const fallback = c.fallbackCapacityId ? state.capacity[c.fallbackCapacityId] : undefined;
        return (
          <article key={c.id} className="capcard" aria-label={`${c.provider} capacity`}>
            <header className="capcard__head">
              <div>
                <div className="capcard__name">{c.provider}</div>
                <div className="capcard__scope">
                  {c.scope.kind} scope · {c.scope.label}
                </div>
              </div>
              <AvailBadge m={c.availability as Measured<string>} />
            </header>
            {c.quotaWindows?.map((q) => <div className="quota-window" key={q.id}><strong>{q.label}</strong>{q.total.value !== null && q.total.value > 0 && q.remaining.value !== null ? <><progress aria-label={`${c.provider} ${q.label} remaining`} value={q.remaining.value} max={q.total.value} /><span>{Math.round(q.remaining.value / q.total.value * 100)}% remaining · {q.remaining.value} / {q.total.value} {q.unit}</span></> : <span>Comparable total not reported · no percentage available</span>}<ProvTag p={q.total.provenance} /></div>)}
            <dl className="kv">
              <dt>Availability source</dt>
              <dd>
                <ProvTag p={c.availability.provenance} /> {c.availability.note ? <span className="muted">{c.availability.note}</span> : null}
              </dd>
              <dt>Models</dt>
              <dd>
                {c.models.join(', ')} {c.modelsIllustrative ? <span className="chip chip--demo">illustrative</span> : null}
              </dd>
              <dt>Remaining</dt>
              <dd>
                {c.remaining.value === null ? <span className="muted">Not reported</span> : `${c.remaining.value.toLocaleString()} ${c.remaining.unit ?? ''}`}{' '}
                <ProvTag p={c.remaining.provenance} />
                {c.remaining.note ? <div className="muted small">{c.remaining.note}</div> : null}
              </dd>
              <dt>Resets</dt>
              <dd>
                {c.resetAt.value === null ? (
                  <span className="muted">Unknown</span>
                ) : (
                  <>
                    in <strong className="mono">{countdown(state.now, c.resetAt.value)}</strong> <span className="muted">({clock(c.resetAt.value)})</span>
                  </>
                )}{' '}
                <ProvTag p={c.resetAt.provenance} />
              </dd>
              <dt>Local usage</dt>
              <dd>
                {c.local.requests.value ?? 0} requests · {(c.local.tokens.value ?? 0).toLocaleString()} tokens <ProvTag p="locally_measured" />
                <div className="muted small">{c.local.windowLabel}; not a quota</div>
              </dd>
              <dt>Fallback</dt>
              <dd>{fallback ? `${fallback.provider}${c.fallbackNote ? ` (${c.fallbackNote.toLowerCase()})` : ''}` : <span className="muted">None configured</span>}</dd>
              <dt>Shared by</dt>
              <dd>
                {users.length ? users.map((w) => w.name).join(', ') : <span className="muted">No active workers</span>}
                {waiting.length ? <div className="warn small">{waiting.length} task{waiting.length > 1 ? 's' : ''} waiting for eligible capacity</div> : null}
              </dd>
              <dt>Last checked</dt>
              <dd>{c.lastCheckedAt ? `${relTime(state.now, c.lastCheckedAt)} (${clock(c.lastCheckedAt)})` : <span className="muted">Never</span>}</dd>
            </dl>
          </article>
        );
      })}
    </section>
  );
}

/** Compact HQ indicator shown on the campus. */
export function CapacityChip() {
  const state = useWorkshop((s) => s);
  const caps = Object.values(state.capacity);
  return (
    <button className="capchip" onClick={() => ui.setPrefs({ tab: 'capacity' })} aria-label="Open AI capacity panel">
      <span className="capchip__h">
        <Icon name="capacity" size={13} /> AI capacity
      </span>
      {caps.length ? (
        caps.map((c) => (
          <span key={c.id} className={`capchip__row avail--${c.availability.value ?? 'unknown'}`}>
            <span className="capchip__p">{c.provider}</span>
            <span>{availLabel(c.availability.value)}</span>
            {c.availability.value === 'unavailable' && c.resetAt.value !== null ? <span className="mono">resets {countdown(state.now, c.resetAt.value)}</span> : null}
            {c.availability.value === 'unavailable' && c.resetAt.value === null ? <span className="muted">reset unknown</span> : null}
          </span>
        ))
      ) : (
        <span className="muted">unknown</span>
      )}
    </button>
  );
}
