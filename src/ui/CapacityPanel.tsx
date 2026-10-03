import { Fragment } from 'react';
import type { Availability, CapacityWindow, Measured, Provenance, ProviderCapacity } from '../core/types';
import { capacityAvailability, capacityConsumers, capacityFresh, tasksWaitingOn } from '../core/selectors';
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

function AvailBadge({ m }: { m: Measured<Availability> }) {
  const v = m.value ?? 'unknown';
  const icon = v === 'available' ? 'check' : v === 'unavailable' ? 'close' : v === 'limited' ? 'minus' : 'info';
  return (
    <span className={`avail avail--${v}`}>
      <Icon name={icon} size={13} />
      {availLabel(v)}
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

function ObservedAt({ at }: { at: number | null }) {
  return at === null ? <span className="muted">Unknown</span> :
    <time className="mono" dateTime={new Date(at).toISOString()}>{new Date(at).toISOString()}</time>;
}

function WindowValue({ m, unit }: { m: Measured<number>; unit: CapacityWindow['unit'] }) {
  return <>{m.value === null || m.provenance !== 'provider_reported' ? <span className="muted">Not reported</span> : `${m.value.toLocaleString()} ${unit}`}{' '}
    <ProvTag p={m.provenance} />{m.note ? <div className="muted small">{m.note}</div> : null}</>;
}

function CapacityWindowRow({ window: w, now }: { window: CapacityWindow; now: number }) {
  return <Fragment>
    <dt>{w.label}</dt>
    <dd>
      <div>Remaining: <WindowValue m={w.remaining} unit={w.unit} /></div>
      <div>Limit: <WindowValue m={w.limit} unit={w.unit} /></div>
      <div className="muted small">Scope: {w.scope} · Unit: {w.unit}</div>
      <div className="muted small">Source: {w.source || 'Unknown'}</div>
      <div className="muted small">Observed: <ObservedAt at={w.observedAt} /> · {w.observedAt === null ? 'Unknown freshness' : capacityFresh(now, w.observedAt, w.maxAgeMs) ? 'Fresh' : 'Stale'} (max age {w.maxAgeMs} ms)</div>
      <div>Reset: {w.resetAt.value === null || w.resetAt.provenance === 'unknown' ? 'Unknown' :
        w.resetAt.value <= now ? 'Reset time passed; recovery not observed' : `in ${countdown(now, w.resetAt.value)} (${new Date(w.resetAt.value).toISOString()})`}{' '}
        <ProvTag p={w.resetAt.provenance} />{w.resetAt.note ? <div className="muted small">{w.resetAt.note}</div> : null}</div>
    </dd>
  </Fragment>;
}

export function CapacityPanel() {
  const state = useWorkshop((s) => s);
  const caps = Object.values(state.capacity);
  const demo = useUi((s) => s.prefs.source) === 'demo';
  return (
    <section className="cap" aria-labelledby="cap-h">
      <h2 id="cap-h" className="panel__h">
        AI provider capacity {demo ? <span className="chip chip--demo">DEMO</span> : null}
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
              <AvailBadge m={{ ...c.availability, value: capacityAvailability(state, c) }} />
            </header>
            <dl className="kv">
              <dt>Configuration</dt>
              <dd>{c.configured === true ? 'Configured' : c.configured === false ? 'Not configured' : 'Unknown'}</dd>
              <dt>Capacity source</dt>
              <dd>{c.source || 'Unknown'}</dd>
              <dt>Availability source</dt>
              <dd>
                <ProvTag p={c.availability.provenance} /> {c.availability.note ? <span className="muted">{c.availability.note}</span> : null}
              </dd>
              <dt>Models</dt>
              <dd>
                {c.models.join(', ')} {c.modelsIllustrative ? <span className="chip chip--demo">illustrative</span> : null}
              </dd>
              {c.windows !== undefined ? c.windows.map((w) => <CapacityWindowRow key={w.id} window={w} now={state.now} />) : <>
              <dt>Remaining</dt>
              <dd>
                {c.remaining.value === null ? <span className="muted">Not reported</span> : `${c.remaining.value.toLocaleString()} ${c.remaining.unit ?? ''}`}{' '}
                <ProvTag p={c.remaining.provenance} />
                {c.remaining.note ? <div className="muted small">{c.remaining.note}</div> : null}
              </dd>
              <dt>Resets</dt>
              <dd>
                {c.resetAt.value === null || c.resetAt.provenance === 'unknown' ? (
                  <span className="muted">Unknown</span>
                ) : c.resetAt.value <= state.now ? (
                  <span className="muted">Reset time passed; recovery not observed</span>
                ) : (
                  <>
                    in <strong className="mono">{countdown(state.now, c.resetAt.value)}</strong> <span className="muted">({clock(c.resetAt.value)})</span>
                  </>
                )}{' '}
                <ProvTag p={c.resetAt.provenance} />
              </dd>
              </>}
              <dt>Local usage</dt>
              <dd>
                {`${c.local.requests.value === null || c.local.requests.provenance === 'unknown' ? 'Unknown' : c.local.requests.value.toLocaleString()} requests`}{' '}
                <ProvTag p={c.local.requests.provenance} /> ·{' '}
                {`${c.local.tokens.value === null || c.local.tokens.provenance === 'unknown' ? 'Unknown' : c.local.tokens.value.toLocaleString()} tokens`}{' '}
                <ProvTag p={c.local.tokens.provenance} />
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
              <dd><ObservedAt at={c.lastCheckedAt} /> {c.lastCheckedAt !== null ? relTime(state.now, c.lastCheckedAt) : null}</dd>
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
  const demo = useUi((s) => s.prefs.source) === 'demo';
  const caps = Object.values(state.capacity);
  return (
    <button className="capchip" onClick={() => ui.setPrefs({ tab: 'capacity' })} aria-label="Open AI capacity panel">
      <span className="capchip__h">
        <Icon name="capacity" size={13} /> AI capacity {demo ? <span className="chip chip--demo">DEMO</span> : null}
      </span>
      {caps.length ? (
        caps.map((c) => {
          const availability = capacityAvailability(state, c);
          return <span key={c.id} className={`capchip__row avail--${availability}`}>
            <span className="capchip__p">{c.provider}</span>
            <span>{availLabel(availability)}</span>
            {availability === 'unavailable' && c.resetAt.value !== null && c.resetAt.provenance !== 'unknown' ?
              <span className="mono">{c.resetAt.value <= state.now ? 'recovery not observed' : `reset hint ${countdown(state.now, c.resetAt.value)}`}</span> : null}
            {availability === 'unavailable' && (c.resetAt.value === null || c.resetAt.provenance === 'unknown') ? <span className="muted">reset unknown</span> : null}
          </span>;
        })
      ) : (
        <span className="muted">unknown</span>
      )}
    </button>
  );
}
