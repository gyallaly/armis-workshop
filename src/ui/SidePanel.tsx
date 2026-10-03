import { useEffect, useMemo, useRef, useState } from 'react';
import { BUSINESS_BY_ID, DEPARTMENT_BY_ID } from '../core/config';
import { stageLabel, stateLabel } from '../core/reducer';
import { displayStatus, elapsed, tasksSorted, workersIn } from '../core/selectors';
import type { CriterionState, Task, TimelineEntry, Worker, WorkerState, WorkshopState } from '../core/types';
import { characterSprite } from '../scene/sprites';
import { CapacityPanel, ProvTag } from './CapacityPanel';
import { TRADING_BUSINESSES } from '../core/config';
import { CandidateDetail, LedgerPanel } from './LedgerPanel';
import { clock, relTime, shortClock } from './format';
import { Icon } from './Icon';
import { store, ui, useUi, useWorkshop } from './store';

export const STATE_ICON: Record<WorkerState, string> = {
  active: 'bolt',
  idle: 'lounge',
  waiting_provider: 'cloud',
  waiting_approval: 'user',
  failed: 'close',
  offline: 'wifi',
  unknown: 'info',
};

export function StateBadge({ state, stale }: { state: WorkerState; stale?: boolean }) {
  return (
    <span className={`state state--${state}`}>
      <Icon name={STATE_ICON[state]} size={13} />
      {stateLabel(state)}
      {stale ? ' (stale)' : ''}
    </span>
  );
}

export function Avatar({ worker, state, size = 64 }: { worker: Worker; state: WorkerState; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    const tint = state === 'offline' ? 'ghost' : state === 'unknown' ? 'grey' : 'none';
    const spr = characterSprite(worker.id, worker.appearance, state === 'idle' ? 'coffee' : 'stand', 0, false, tint);
    g.drawImage(spr, 0, 0, spr.width, 15, 1, 1, spr.width, 15);
  }, [worker, state]);
  return (
    <canvas
      ref={ref}
      width={16}
      height={16}
      className={`avatar avatar--${state}`}
      style={{ width: size, height: size, background: BUSINESS_BY_ID[worker.businessId]?.brand.colors.secondary }}
      aria-hidden="true"
    />
  );
}

function selectWorker(w: Worker) {
  const v = ui.get().view;
  if (v.mode !== 'interior' || v.businessId !== w.businessId) ui.go({ mode: 'interior', businessId: w.businessId });
  setTimeout(() => ui.select({ kind: 'worker', id: w.id }), 0);
}

function Criteria({ list }: { list: CriterionState[] }) {
  if (!list.length) return <p className="muted">No acceptance criteria recorded.</p>;
  const icon = { met: 'check', unmet: 'close', in_progress: 'reset', pending: 'minus' } as const;
  const word = { met: 'met', unmet: 'not met', in_progress: 'in progress', pending: 'pending' } as const;
  return (
    <ul className="checklist">
      {list.map((c) => (
        <li key={c.text} className={`crit crit--${c.state}`}>
          <Icon name={icon[c.state]} size={14} />
          <span>{c.text}</span>
          <span className="sr-only"> - {word[c.state]}</span>
        </li>
      ))}
    </ul>
  );
}

function Timeline({ entries, now }: { entries: TimelineEntry[]; now: number }) {
  if (!entries.length) return <p className="muted">No events observed yet.</p>;
  return (
    <ol className="timeline">
      {entries
        .slice(-8)
        .reverse()
        .map((e) => (
          <li key={e.eventId} className={`tl tl--${e.type.split('.')[0]}`}>
            <time className="mono" dateTime={new Date(e.at).toISOString()} title={relTime(now, e.at)}>
              {clock(e.at)}
            </time>
            <span>{e.text}</span>
          </li>
        ))}
    </ol>
  );
}

function Findings({ task }: { task: Task }) {
  if (!task.findings.length) return <p className="muted">No audit findings recorded.</p>;
  return (
    <ul className="findings">
      {task.findings.map((f) => (
        <li key={f.id} className={f.resolved ? 'is-resolved' : ''}>
          <span className={`sev sev--${f.severity}`}>{f.severity}</span>
          <span>{f.summary}</span>
          <span className="muted small">{f.resolved ? 'resolved' : 'open'}</span>
        </li>
      ))}
    </ul>
  );
}

function RedirectStatus({ state, workerId }: { state: WorkshopState; workerId: string }) {
  const list = Object.values(state.redirects).filter((r) => r.workerId === workerId);
  const r = list[list.length - 1];
  if (!r) return null;
  const steps = ['requested', 'acknowledged', r.state === 'rejected' ? 'rejected' : 'applied'] as const;
  const reached = (s: string) => r.history.some((h) => h.state === s) || r.state === s;
  return (
    <div className="rstatus" role="status" aria-live="polite">
      <div className="rstatus__h">
        Redirect {r.simulated ? <span className="chip chip--demo">simulated</span> : null}
      </div>
      <ol className="rsteps">
        {steps.map((s) => (
          <li key={s} className={`${reached(s) ? 'is-done' : ''} ${s === 'rejected' ? 'is-bad' : ''}`}>
            {s}
          </li>
        ))}
      </ol>
      <div className="small muted">"{r.instruction}"</div>
      {r.reason ? <div className="small bad">Reason: {r.reason}</div> : null}
    </div>
  );
}

function Actions({ state, workerId, task }: { state: WorkshopState; workerId?: string; task?: Task }) {
  const live = state.connection === 'disconnected';
  const worker = workerId ? state.workers[workerId] : undefined;
  const d = worker ? displayStatus(state, worker) : undefined;
  // Redirect only a fresh, observed worker that is actually on this task.
  const blocker = !store.adapter?.capabilities.redirect || live
    ? 'Read-only Live viewer: redirect and controls are disabled.'
    : state.connection === 'reconnecting'
      ? 'Redirect is paused while the stream reconnects.'
      : !task || !workerId
        ? 'No current task to redirect.'
        : task.assignedWorkerId !== workerId
          ? 'This worker is not assigned to the task.'
          : d?.stale
            ? 'Worker status is stale; redirect needs a fresh observation.'
            : ['ready', 'rejected', 'held'].includes(task.status)
              ? `Task is ${task.status}; nothing to redirect.`
              : null;
  const canRedirect = blocker === null;
  const hasEvidence = Boolean(task && task.artifactIds.length);
  return (
    <div className="actions">
      <button className="btn btn--primary" disabled={!canRedirect} onClick={() => workerId && task && ui.update({ redirectFor: { workerId, taskId: task.id } })}>
        <Icon name="redirect" /> Redirect task
      </button>
      <button className="btn" disabled={!hasEvidence} onClick={() => task && ui.update({ evidenceFor: task.id })}>
        <Icon name="folder" /> View evidence
      </button>
      <p className="note note--info">
        <Icon name="info" size={16} />
        {blocker ??
          (store.adapter?.kind === 'demo'
            ? 'Demo mode: redirect is simulated and is applied only after the worker acknowledges it.'
            : 'Redirect is applied only after the worker acknowledges it.')}
      </p>
    </div>
  );
}

function WorkerDetail({ state, worker }: { state: WorkshopState; worker: Worker }) {
  const d = displayStatus(state, worker);
  const st = d.status;
  const task = st?.taskId ? state.tasks[st.taskId] : undefined;
  const b = BUSINESS_BY_ID[worker.businessId]!;
  const timeline = task ? state.taskTimeline[task.id] ?? [] : state.timeline.filter((e) => e.workerId === worker.id);
  const artifact = task?.artifactIds.length ? state.artifacts[task.artifactIds[task.artifactIds.length - 1]!] : undefined;
  return (
    <section className="detail" aria-labelledby="wd-h" style={{ ['--brand' as string]: b.brand.colors.accent, fontFamily: b.brand.fontFamily }}>
      <div className="panel__h panel__h--row">
        <span>Worker detail</span>
        <button className="btn btn--ghost btn--sm" onClick={() => ui.select(null)} aria-label="Close worker detail">
          <Icon name="close" size={14} />
        </button>
      </div>
      <header className="who">
        <Avatar worker={worker} state={d.state} size={72} />
        <div>
          <h2 id="wd-h" className="who__name">
            {worker.name}
          </h2>
          <div className="who__meta">
            {b.brand.displayName} · {worker.role}
          </div>
          <StateBadge state={d.state} stale={d.stale && d.reported !== null && d.reported !== 'unknown'} />
          {d.stale && d.reported ? <div className="small muted">Last reported: {stateLabel(d.reported)}</div> : null}
        </div>
      </header>
      {worker.installation ? <p className="small muted">{worker.installation.installed === true ? 'Installed' : worker.installation.installed === false ? 'Not installed' : 'Installation unverified'} · {worker.installation.observed ? 'observed' : 'not observed'} · {worker.installation.roleBinding === 'unbound' ? 'Armis role unbound' : worker.installation.roleBinding === 'verified' ? 'role binding verified' : 'role binding unknown'}</p> : null}
      <dl className="kv">
        <dt>Provider</dt>
        <dd>
          {st?.provider ? (
            <>
              {st.provider.provider}
              {st.provider.model ? <span className="mono"> · {st.provider.model}</span> : null}{' '}
              {state.connection === 'demo' ? <span className="chip chip--demo">illustrative</span> : <ProvTag p={st.provider.modelProvenance} />}
            </>
          ) : (
            <span className="muted">Not known</span>
          )}
        </dd>
        <dt>Task</dt>
        <dd>
          {task ? (
            <button className="link" onClick={() => ui.select({ kind: 'task', id: task.id })}>
              {task.title}
            </button>
          ) : (
            <span className="muted">None</span>
          )}
        </dd>
        <dt>Location</dt>
        <dd>{DEPARTMENT_BY_ID[d.departmentId]?.label ?? 'Unknown'}</dd>
        <dt>Action</dt>
        <dd>
          {st?.action ? st.action : <span className="muted">-</span>}
          {st?.tool ? <span className="mono muted"> · {st.tool}</span> : null}
        </dd>
        <dt>In state</dt>
        <dd className="mono">{elapsed(state.now, st?.stateSince)}</dd>
        <dt>Last seen</dt>
        <dd>{st ? `${relTime(state.now, st.lastObservedAt)} (${clock(st.lastObservedAt)})` : <span className="muted">Never observed</span>}</dd>
        <dt>IDs</dt>
        <dd className="mono small">
          {worker.id}
          {st?.attemptId ? ` · ${st.attemptId}` : ''}
          {st?.sessionId ? ` · ${st.sessionId}` : ''}
        </dd>
      </dl>
      {task ? (
        <>
          <h3 className="sub">Acceptance criteria</h3>
          <Criteria list={task.acceptanceCriteria} />
        </>
      ) : null}
      <h3 className="sub">Timeline</h3>
      <Timeline entries={timeline} now={state.now} />
      {task?.findings.length ? (
        <>
          <h3 className="sub">Audit findings</h3>
          <Findings task={task} />
        </>
      ) : null}
      {artifact ? (
        <>
          <h3 className="sub">Latest evidence</h3>
          <button className="evidence-peek" onClick={() => task && ui.update({ evidenceFor: task.id })}>
            <span className="mono">{artifact.title}</span>
            <span className="small muted">{artifact.preview.split('\n')[0]}</span>
          </button>
        </>
      ) : null}
      <Actions state={state} workerId={worker.id} task={task} />
      <RedirectStatus state={state} workerId={worker.id} />
    </section>
  );
}

function TaskDetail({ state, task }: { state: WorkshopState; task: Task }) {
  const w = task.assignedWorkerId ? state.workers[task.assignedWorkerId] : undefined;
  const b = BUSINESS_BY_ID[task.businessId]!;
  return (
    <section className="detail" aria-labelledby="td-h">
      <div className="panel__h panel__h--row">
        <span>Task</span>
        <button className="btn btn--ghost btn--sm" onClick={() => ui.select(null)} aria-label="Close task detail">
          <Icon name="close" size={14} />
        </button>
      </div>
      <h2 id="td-h" className="task__title">
        <Icon name="doc" /> {task.title}
      </h2>
      <dl className="kv">
        <dt>Business</dt>
        <dd>{b.brand.displayName}</dd>
        <dt>Stage</dt>
        <dd>{stageLabel(task.stage)}</dd>
        <dt>Status</dt>
        <dd>
          <span className={`tstatus tstatus--${task.status}`}>{task.status.replace('_', ' ')}</span>
          {task.heldReason ? <div className="small warn">{task.heldReason}</div> : null}
        </dd>
        <dt>Worker</dt>
        <dd>
          {w ? (
            <button className="link" onClick={() => selectWorker(w)}>
              {w.name}
            </button>
          ) : (
            <span className="muted">Unassigned</span>
          )}
        </dd>
        <dt>Repairs</dt>
        <dd>
          {task.repairCount} of {task.maxRepairs} allowed
        </dd>
        <dt>Updated</dt>
        <dd>{relTime(state.now, task.updatedAt)}</dd>
        <dt>Task id</dt>
        <dd className="mono small">{task.id}</dd>
        {task.parentTaskId ? <><dt>Parent task</dt><dd><button className="link mono small" onClick={() => ui.select({kind:'task',id:task.parentTaskId!})}>{task.parentTaskId}</button></dd></> : null}
      </dl>
      {TRADING_BUSINESSES.has(task.businessId) ? <CandidateDetail businessId={task.businessId} taskId={task.id} /> : null}
      {task.status === 'ready' ? (
        <p className="note note--ok">Ready means the workshop finished its checks. It is not permission to send or publish.</p>
      ) : null}
      <h3 className="sub">Acceptance criteria</h3>
      <Criteria list={task.acceptanceCriteria} />
      <h3 className="sub">Attempts</h3>
      <ul className="attempts">
        {task.attemptIds.map((id) => {
          const a = state.attempts[id];
          if (!a) return null;
          return (
            <li key={id}>
              <span className="mono small">{id}</span>
              <span>
                {stageLabel(a.stage)} · {state.workers[a.workerId]?.name ?? a.workerId}
              </span>
              <span className={a.outcome ? `out out--${a.outcome}` : 'muted'}>{a.outcome ?? (a.endedAt ? 'ended · outcome not observed' : 'outcome not observed')}</span>
            </li>
          );
        })}
        {!task.attemptIds.length ? <li className="muted">No attempts yet.</li> : null}
      </ul>
      <h3 className="sub">Audit findings</h3>
      <Findings task={task} />
      <h3 className="sub">Timeline</h3>
      <Timeline entries={state.taskTimeline[task.id] ?? []} now={state.now} />
      <Actions state={state} workerId={task.assignedWorkerId} task={task} />
      {task.assignedWorkerId ? <RedirectStatus state={state} workerId={task.assignedWorkerId} /> : null}
    </section>
  );
}

function FeaturedWorker({ state }: { state: WorkshopState }) {
  // The most recently observed worker who is actually working right now.
  const recent = [...state.timeline].reverse().find((e) => e.workerId && displayStatus(state, state.workers[e.workerId]!).state === 'active' && !state.workers[e.workerId]!.id.startsWith('w-echo'));
  const w = recent?.workerId ? state.workers[recent.workerId] : undefined;
  if (!w) return null;
  const d = displayStatus(state, w);
  const task = d.status?.taskId ? state.tasks[d.status.taskId] : undefined;
  const b = BUSINESS_BY_ID[w.businessId]!;
  return (
    <section className="featured" aria-label="Featured worker">
      <div className="featured__card" style={{ ['--brand' as string]: b.brand.colors.accent }}>
        <Avatar worker={w} state={d.state} size={104} />
        <div className="featured__who">
          <div className="featured__name">{w.name}</div>
          <div className="muted">{b.brand.displayName}</div>
          <div className="muted">{w.role}</div>
          <StateBadge state={d.state} />
        </div>
      </div>
      {task ? (
        <div className="featured__task">
          <div className="sub sub--flush">Current task</div>
          <div className="featured__title">
            <Icon name="doc" /> {task.title}
          </div>
          <div className="small muted">{d.status?.action ?? '-'}</div>
          <div className="small muted">
            {stageLabel(task.stage)} · in state {elapsed(state.now, d.status?.stateSince)}
          </div>
        </div>
      ) : null}
      <button className="btn btn--primary btn--wide" onClick={() => selectWorker(w)}>
        <Icon name="user" /> View worker
      </button>
    </section>
  );
}

function Feed({ state }: { state: WorkshopState }) {
  const view = useUi((s) => s.view);
  const [all, setAll] = useState(false);
  const biz = view.mode === 'interior' ? view.businessId : null;
  const entries = state.timeline.filter((e) => !biz || e.businessId === biz).slice(all ? -40 : -7).reverse();
  const roster = biz ? workersIn(state, biz) : [];
  return (
    <section className="detail" aria-labelledby="feed-h">
      {biz ? (
        <>
          <h2 className="panel__h">Roster · {BUSINESS_BY_ID[biz]?.brand.displayName}</h2>
          <ul className="roster">
            {roster.map((w) => {
              const d = displayStatus(state, w);
              const task = d.status?.taskId ? state.tasks[d.status.taskId] : undefined;
              return (
                <li key={w.id}>
                  <button className="roster__btn" onClick={() => ui.select({ kind: 'worker', id: w.id })}>
                    <Avatar worker={w} state={d.state} size={36} />
                    <span className="roster__who">
                      <strong>{w.name}</strong>
                      <span className="small muted">{w.role}</span>
                    </span>
                    <span className="roster__state">
                      <StateBadge state={d.state} />
                      <span className="small muted roster__task">{task ? task.title : DEPARTMENT_BY_ID[d.departmentId]?.label ?? ''}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {biz && TRADING_BUSINESSES.has(biz) ? <LedgerPanel businessId={biz} /> : null}
      {!biz ? <FeaturedWorker state={state} /> : null}
      <h2 id="feed-h" className="panel__h panel__h--row">
        <span>Recent events</span>
        <button className="link small" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? 'Fewer' : 'All activity →'}
        </button>
      </h2>
      {!entries.length ? <p className="empty">{biz && !roster.length && state.connection !== 'demo' ? 'No telemetry for this business.' : state.connection === 'disconnected' ? 'Not connected: no events observed.' : 'Waiting for events...'}</p> : null}
      <ol className="feed">
        {entries.map((e) => {
          const who = e.workerId ? state.workers[e.workerId] : undefined;
          return (
            <li key={e.eventId}>
              <button
                className={`feed__item tl--${e.type.split('.')[0]}`}
                onClick={() => (e.workerId && who ? selectWorker(who) : e.taskId ? ui.select({ kind: 'task', id: e.taskId }) : undefined)}
              >
                <time className="mono">{shortClock(e.at)}</time>
                <span className="feed__who">{who?.name ?? BUSINESS_BY_ID[e.businessId]?.brand.displayName ?? 'System'}</span>
                <span className="feed__text">{e.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TaskList({ state }: { state: WorkshopState }) {
  const [biz, setBiz] = useState('all');
  const [status, setStatus] = useState('open');
  const tasks = useMemo(
    () =>
      tasksSorted(state).filter(
        (t) => (biz === 'all' || t.businessId === biz) && (status === 'all' || (status === 'open' ? t.status !== 'ready' && t.status !== 'rejected' : t.status === status)),
      ),
    [state, biz, status],
  );
  return (
    <section className="detail" aria-labelledby="tl-h">
      <h2 id="tl-h" className="panel__h">
        Tasks
      </h2>
      <div className="filters">
        <label>
          Business
          <select value={biz} onChange={(e) => setBiz(e.target.value)}>
            <option value="all">All</option>
            <option value="hermes-hq">Armis Syndicate HQ</option>
            <option value="uditus">Uditus</option>
            <option value="etsy-studio">Etsy Studio</option>
            <option value="aster-ledger">Aster Ledger</option>
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Open</option>
            <option value="all">All</option>
            <option value="in_progress">In progress</option>
            <option value="queued">Queued</option>
            <option value="waiting_provider">Waiting provider</option>
            <option value="waiting_approval">Waiting approval</option>
            <option value="held">Held</option>
            <option value="failed">Failed</option>
            <option value="ready">Ready</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
      </div>
      <p className="small muted" aria-live="polite">
        {tasks.length} task{tasks.length === 1 ? '' : 's'}
      </p>
      <ul className="tasklist">
        {tasks.map((t) => {
          const w = t.assignedWorkerId ? state.workers[t.assignedWorkerId] : undefined;
          return (
            <li key={t.id}>
              <button className="tasklist__row" onClick={() => ui.select({ kind: 'task', id: t.id })}>
                <span className="tasklist__title">{t.title}</span>
                <span className="tasklist__meta">
                  <span>{BUSINESS_BY_ID[t.businessId]?.brand.displayName}</span>
                  <span>{stageLabel(t.stage)}</span>
                  <span className={`tstatus tstatus--${t.status}`}>{t.status.replace('_', ' ')}</span>
                  <span>{w ? w.name : 'unassigned'}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SidePanel() {
  const state = useWorkshop((s) => s);
  const selection = useUi((s) => s.selection);
  const tab = useUi((s) => s.prefs.tab);
  let content;
  if (tab === 'tasks') content = <TaskList state={state} />;
  else if (tab === 'capacity') content = <CapacityPanel />;
  else if (selection?.kind === 'worker' && state.workers[selection.id]) content = <WorkerDetail state={state} worker={state.workers[selection.id]!} />;
  else if (selection?.kind === 'task' && state.tasks[selection.id]) content = <TaskDetail state={state} task={state.tasks[selection.id]!} />;
  else if (selection?.kind === 'dot' && state.tasks[selection.dot.taskId]) content = <TaskDetail state={state} task={state.tasks[selection.dot.taskId]!} />;
  else content = <Feed state={state} />;
  const tabs: [typeof tab, string][] = [
    ['activity', 'Activity'],
    ['tasks', 'Tasks'],
    ['capacity', 'AI capacity'],
  ];
  return (
    <aside className="panel" aria-label="Details">
      <div className="tabs" role="tablist" aria-label="Panel">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls="panel-body" className={`tab ${tab === id ? 'is-on' : ''}`} onClick={() => ui.setPrefs({ tab: id })}>
            {label}
          </button>
        ))}
      </div>
      <div className="panel__body" id="panel-body" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {content}
      </div>
    </aside>
  );
}
