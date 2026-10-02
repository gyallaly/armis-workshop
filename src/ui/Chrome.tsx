import { useEffect, useMemo, useRef, useState } from 'react';
import { SCENARIOS, type ScenarioId } from '../adapters/demo/sim';
import { BUSINESS_BY_ID, BUSINESSES } from '../core/config';
import { businessCounts, workersIn } from '../core/selectors';
import { DOT_STYLE } from '../scene/traffic';
import { dateLabel, shortClock } from './format';
import { Icon } from './Icon';
import { store, ui, useUi, useWorkshop } from './store';

function ConnectionPill() {
  const conn = useWorkshop((s) => s.connection);
  const label = conn === 'demo' ? 'Demo stream' : conn === 'connected' ? 'Live' : conn === 'reconnecting' ? 'Reconnecting - data stale' : 'Live: not connected';
  return (
    <span className={`conn conn--${conn}`} role="status" aria-live="polite">
      <span className="conn__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function BusinessesMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className="nav__btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="building" /> Businesses
      </button>
      {open ? (
        <ul className="menu__list" role="menu" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          {BUSINESSES.map((b) => (
            <li key={b.id} role="none">
              <button
                role="menuitem"
                autoFocus={b.id === BUSINESSES[0]!.id}
                onClick={() => {
                  setOpen(false);
                  ui.go({ mode: 'interior', businessId: b.id });
                }}
              >
                {b.brand.displayName}
                {b.brand.provisional ? <span className="chip chip--prov">provisional</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TopBar() {
  const view = useUi((s) => s.view);
  const tab = useUi((s) => s.prefs.tab);
  const state = useWorkshop((s) => s);
  const conn = state.connection;
  const biz = view.mode === 'interior' ? BUSINESS_BY_ID[view.businessId] : undefined;
  const counts = useMemo(() => (biz ? businessCounts(state, biz.id) : null), [state, biz]);
  return (
    <header className="top">
      <div className="brand">
        <img src="/brand/armis/armis-mark.svg" alt="" width={28} height={28} />
        <span className="brand__name">
          Armis <span>Workshop</span>
        </span>
      </div>
      <span className={`badge ${conn === 'disconnected' ? 'badge--live' : 'badge--demo'}`} title={conn === 'disconnected' ? 'No live data source is connected' : 'All data on screen is simulated'}>
        {conn === 'disconnected' ? 'LIVE · NOT CONNECTED' : 'DEMO DATA'}
      </span>
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <button className={`crumb ${view.mode === 'campus' ? 'is-current' : ''}`} aria-current={view.mode === 'campus' ? 'page' : undefined} onClick={() => ui.go({ mode: 'campus' })}>
              Campus
            </button>
          </li>
          {biz ? (
            <li>
              <span className="crumb is-current" aria-current="page" style={{ color: biz.brand.colors.glow }}>
                {biz.brand.displayName}
              </span>
            </li>
          ) : null}
        </ol>
      </nav>
      <nav className="nav" aria-label="Views">
        <BusinessesMenu />
        <button className={`nav__btn ${tab === 'tasks' ? 'is-on' : ''}`} onClick={() => ui.setPrefs({ tab: 'tasks' })}>
          <Icon name="list" /> Tasks
        </button>
        <button className={`nav__btn ${tab === 'capacity' ? 'is-on' : ''}`} onClick={() => ui.setPrefs({ tab: 'capacity' })}>
          <Icon name="capacity" /> AI capacity
        </button>
      </nav>
      <div className="top__right">
        {counts && conn !== 'disconnected' ? (
          <span className="topcounts" aria-label="Business summary">
            <span>
              <Icon name="user" size={15} /> {counts.active} working
            </span>
            <span>
              <Icon name="lounge" size={15} /> {counts.idle} idle
            </span>
            <span>
              <Icon name="doc" size={15} /> {counts.queued + counts.waitingProvider} queued
            </span>
            {counts.held ? <span className="warn">{counts.held} held</span> : null}
          </span>
        ) : null}
        <ConnectionPill />
        {conn !== 'disconnected' ? (
          <span className="clock" title="Simulated demo clock">
            <span className="small muted">{dateLabel(state.now)}</span> <strong className="mono">{shortClock(state.now)}</strong>
          </span>
        ) : null}
      </div>
    </header>
  );
}

function MotionSelect() {
  const motion = useUi((s) => s.prefs.motion);
  const sys = useUi((s) => s.systemReducedMotion);
  return (
    <label className="field field--inline demobar__motion">
      <span>Motion</span>
      <select value={motion} onChange={(e) => ui.setPrefs({ motion: e.target.value as typeof motion })}>
        <option value="system">System ({sys ? "reduced" : "full"})</option>
        <option value="full">Full</option>
        <option value="reduced">Reduced</option>
      </select>
    </label>
  );
}

export function DemoBar() {
  const prefs = useUi((s) => s.prefs);
  const demo = useUi((s) => s.demo);
  const stats = useWorkshop((s) => s.stats);
  const live = prefs.source === 'live';
  const ctrl = store.demo;
  const scenario = SCENARIOS.find((s) => s.id === demo.scenario);
  return (
    <div className="demobar" role="region" aria-label="Data source and demo controls">
      <label className="field field--inline">
        <span>Source</span>
        <select
          aria-label="Data source"
          value={prefs.source}
          onChange={(e) => {
            const source = e.target.value as 'demo' | 'live';
            ui.setPrefs({ source });
            ui.select(null);
            store.start(source, ui.get().prefs);
          }}
        >
          <option value="demo">Demo (simulated)</option>
          <option value="live">Live (not connected)</option>
        </select>
      </label>
      {!live && ctrl ? (
        <>
          <button className="btn btn--sm" onClick={() => ctrl.setPaused(!demo.paused)} aria-pressed={demo.paused}>
            <Icon name={demo.paused ? 'play' : 'pause'} size={14} /> {demo.paused ? 'Resume' : 'Pause'}
          </button>
          <label className="field field--inline">
            <span>Speed</span>
            <select
              value={demo.speed}
              onChange={(e) => {
                const speed = Number(e.target.value);
                ctrl.setSpeed(speed);
                ui.setPrefs({ speed });
              }}
            >
              {[0.5, 1, 2, 4, 8].map((s) => (
                <option key={s} value={s}>
                  {s}x
                </option>
              ))}
            </select>
          </label>
          <label className="field field--inline">
            <span>Scenario</span>
            <select
              title={scenario?.description}
              value={demo.scenario}
              onChange={(e) => {
                const id = e.target.value as ScenarioId;
                ui.setPrefs({ scenario: id });
                ui.select(null);
                ctrl.setScenario(id);
              }}
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn--sm"
            onClick={() => {
              ui.select(null);
              ctrl.reset();
            }}
            title="Replay this scenario from the start (same seed, same events)"
          >
            <Icon name="reset" size={14} /> Reset
          </button>
          <button className="btn btn--sm" onClick={() => ctrl.simulateDrop(20_000)} disabled={demo.dropping}>
            <Icon name="wifi" size={14} /> Drop stream 20s
          </button>
          <span className="demobar__stats small muted mono" title="Stream diagnostics: events applied, duplicates dropped, late events not allowed to overwrite newer state">
            {stats.applied} ev · {stats.duplicates} dup · {stats.outOfOrder} late
          </span>
        </>
      ) : (
        <span className="small muted demobar__desc">
          No live bridge is configured tonight. Counts and states show as unknown rather than guessed. See docs/LIVE-INTEGRATION.md.
        </span>
      )}
      <MotionSelect />
    </div>
  );
}

export function SceneToolbar() {
  const view = useUi((s) => s.view);
  const prefs = useUi((s) => s.prefs);
  const zoom = useUi((s) => s.zoomPercent);
  const follow = useUi((s) => s.follow);
  const selection = useUi((s) => s.selection);
  const state = useWorkshop((s) => s);
  const zoomEv = (d: 'in' | 'out' | 'reset') => window.dispatchEvent(new CustomEvent('armis:zoom', { detail: d }));
  const workers = view.mode === 'interior' ? workersIn(state, view.businessId) : [];
  return (
    <div className="toolbar" role="toolbar" aria-label="Scene controls">
      {view.mode === 'interior' ? (
        <label className="field field--inline">
          <Icon name="target" size={16} />
          <span className="sr-only">Follow worker</span>
          <select
            value={follow && selection?.kind === 'worker' ? selection.id : ''}
            onChange={(e) => {
              if (!e.target.value) ui.update({ follow: false });
              else {
                ui.select({ kind: 'worker', id: e.target.value });
                ui.update({ follow: true });
              }
            }}
            aria-label="Follow worker"
          >
            <option value="">Follow worker...</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="zoom" role="group" aria-label="Zoom">
        <button className="btn btn--icon" onClick={() => zoomEv('out')} aria-label="Zoom out">
          <Icon name="minus" />
        </button>
        <span className="zoom__pct mono" aria-live="polite">
          {zoom}%
        </span>
        <button className="btn btn--icon" onClick={() => zoomEv('in')} aria-label="Zoom in">
          <Icon name="plus" />
        </button>
      </div>
      <button className="btn btn--sm" onClick={() => zoomEv('reset')} title="Reset view (0)">
        <Icon name="target" size={14} /> Reset view
      </button>
      <button className="btn btn--icon" aria-pressed={prefs.minimap} onClick={() => ui.setPrefs({ minimap: !prefs.minimap })} aria-label="Toggle minimap" title="Minimap">
        <Icon name="map" />
      </button>
      <label className="switch">
        <input type="checkbox" checked={prefs.taskFlow} onChange={(e) => ui.setPrefs({ taskFlow: e.target.checked })} />
        <span className="switch__track" aria-hidden="true" />
        Task flow
      </label>
    </div>
  );
}

export function Legend() {
  const view = useUi((s) => s.view);
  const items = view.mode === 'campus' ? (['dispatched', 'ready'] as const) : (['handoff', 'failed_audit', 'ready', 'dispatched'] as const);
  const shapes: Record<string, string> = { dot: '●', diamond: '◆', plus: '✚', square: '■' };
  return (
    <div className="legend" aria-label="Legend">
      <div className="legend__group">
        <span className="legend__h">Traffic</span>
        {items.map((k) => (
          <span key={k} className="legend__item">
            <span style={{ color: DOT_STYLE[k].color }} aria-hidden="true">
              {shapes[DOT_STYLE[k].shape]}
            </span>
            {k === 'handoff' ? 'Research → Creation → Audit' : k === 'failed_audit' ? 'Fail → Fixes → Re-audit' : k === 'ready' ? 'Ready (not sent)' : 'From HQ'}
          </span>
        ))}
      </div>
      {view.mode === 'interior' ? (
        <div className="legend__group">
          <span className="legend__h">Workers</span>
          <span className="legend__item">⌛ provider</span>
          <span className="legend__item">✋ approval</span>
          <span className="legend__item">! failed</span>
          <span className="legend__item">⏻ offline</span>
          <span className="legend__item">? unknown</span>
        </div>
      ) : null}
    </div>
  );
}
