import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BUSINESS_BY_ID } from '../core/config';
import { stageLabel } from '../core/reducer';
import { clock } from './format';
import { Icon } from './Icon';
import { store, ui, useUi, useWorkshop } from './store';

function Modal({ open, onClose, title, children, id }: { open: boolean; onClose: () => void; title: string; children: ReactNode; id: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-labelledby={`${id}-h`} onClose={onClose} onCancel={onClose}>
      <header className="modal__head">
        <h2 id={`${id}-h`}>{title}</h2>
        <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close dialog">
          <Icon name="close" size={16} />
        </button>
      </header>
      {open ? children : null}
    </dialog>
  );
}

export function RedirectDialog() {
  const target = useUi((s) => s.redirectFor);
  const state = useWorkshop((s) => s);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  useEffect(() => {
    setText('');
    setError(null);
    setSentId(null);
  }, [target?.workerId, target?.taskId]);
  const close = () => ui.update({ redirectFor: null });
  const worker = target ? state.workers[target.workerId] : undefined;
  const task = target ? state.tasks[target.taskId] : undefined;
  const sent = sentId ? state.redirects[sentId] : undefined;
  const live = state.connection === 'disconnected';
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    if (!text.trim()) {
      setError('Write an instruction first.');
      return;
    }
    const r = store.redirect(target.workerId, target.taskId, text);
    if (!r.ok) setError(r.reason ?? 'Redirect was not accepted.');
    else {
      setError(null);
      setSentId(r.id!);
    }
  };
  return (
    <Modal open={Boolean(target)} onClose={close} title="Redirect task" id="redirect">
      {worker && task ? (
        <form className="redirect" onSubmit={submit}>
          <p className={`banner ${live ? 'banner--off' : 'banner--demo'}`}>
            <Icon name="info" size={16} />
            {live
              ? 'Live bridge not connected - redirect is disabled.'
              : 'Simulated. In demo mode no agent, provider or terminal is contacted; a scripted worker acknowledges and applies or rejects the request.'}
          </p>
          <dl className="kv kv--tight">
            <dt>Worker</dt>
            <dd>
              {worker.name} <span className="mono small muted">({worker.id})</span>
            </dd>
            <dt>Task</dt>
            <dd>
              {task.title} <span className="mono small muted">({task.id})</span>
            </dd>
            <dt>Business</dt>
            <dd>{BUSINESS_BY_ID[task.businessId]?.brand.displayName}</dd>
            <dt>Stage</dt>
            <dd>
              {stageLabel(task.stage)} · {task.status.replace('_', ' ')}
            </dd>
          </dl>
          <label className="field">
            <span>Instruction</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="e.g. Prioritise keyboard navigation before claims review."
              disabled={live || Boolean(sent)}
              aria-describedby="redirect-help"
            />
          </label>
          <p id="redirect-help" className="small muted">
            Plain-language guidance only. This is not a command line and nothing is executed.
          </p>
          {error ? (
            <p className="bad small" role="alert">
              {error}
            </p>
          ) : null}
          {sent ? (
            <div className="rstatus" role="status" aria-live="polite">
              <ol className="rsteps">
                {(['requested', 'acknowledged', sent.state === 'rejected' ? 'rejected' : 'applied'] as const).map((s) => (
                  <li key={s} className={`${sent.history.some((h) => h.state === s) || sent.state === s ? 'is-done' : ''} ${s === 'rejected' ? 'is-bad' : ''}`}>
                    {s}
                  </li>
                ))}
              </ol>
              {sent.history.map((h) => (
                <div key={h.state} className="small">
                  <span className="mono">{clock(h.at)}</span> {h.state}
                  {h.note ? ` - ${h.note}` : ''}
                </div>
              ))}
              {sent.reason ? <div className="bad small">Rejected: {sent.reason}</div> : null}
            </div>
          ) : null}
          <div className="modal__actions">
            <button type="button" className="btn" onClick={close}>
              {sent ? 'Done' : 'Cancel'}
            </button>
            {!sent ? (
              <button type="submit" className="btn btn--primary" disabled={live}>
                <Icon name="redirect" /> Send simulated redirect
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="empty">That task is no longer available.</p>
      )}
    </Modal>
  );
}

export function EvidenceDialog() {
  const taskId = useUi((s) => s.evidenceFor);
  const state = useWorkshop((s) => s);
  const task = taskId ? state.tasks[taskId] : undefined;
  const arts = task ? task.artifactIds.map((id) => state.artifacts[id]).filter(Boolean) : [];
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(Math.max(0, arts.length - 1)), [taskId, arts.length]);
  const a = arts[idx];
  return (
    <Modal open={Boolean(taskId)} onClose={() => ui.update({ evidenceFor: null })} title={task ? `Evidence · ${task.title}` : 'Evidence'} id="evidence">
      <div className="evidence">
        <p className="banner banner--demo">
          <Icon name="info" size={16} />
          Observable artifacts only - no private model reasoning is recorded or shown. {a?.illustrative ? 'Demo artifacts are illustrative content.' : ''}
        </p>
        {arts.length ? (
          <div className="evidence__grid">
            <ul className="evidence__list" aria-label="Artifacts">
              {arts.map((x, i) => (
                <li key={x!.id}>
                  <button className={`evidence__item ${i === idx ? 'is-on' : ''}`} aria-pressed={i === idx} onClick={() => setIdx(i)}>
                    <span className="mono">{x!.title}</span>
                    <span className="small muted">
                      {x!.kind} · {clock(x!.recordedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {a ? (
              <figure className="evidence__view">
                <figcaption className="small muted">
                  {a.title} · attempt <span className="mono">{a.attemptId}</span>
                </figcaption>
                <pre className={`evidence__pre evidence__pre--${a.kind}`}>
                  {a.preview.split('\n').map((line, i) => (
                    <span key={i} className={a.kind === 'diff' ? (line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : '') : ''}>
                      {line}
                      {'\n'}
                    </span>
                  ))}
                </pre>
              </figure>
            ) : null}
          </div>
        ) : (
          <p className="empty">No artifacts recorded for this task yet.</p>
        )}
      </div>
    </Modal>
  );
}

export function NewsDrawer() {
  const target = useUi((s) => s.newsFor);
  const state = useWorkshop((s) => s);
  const book = state.ledger['aster-ledger'];
  const items = !book || !target ? [] : target === 'all' ? book.news : book.news.filter((n) => n.candidateId === target);
  const byId = new Map((book?.news ?? []).map((n) => [n.id, n]));
  return (
    <Modal open={Boolean(target)} onClose={() => ui.update({ newsFor: null })} title="News & evidence" id="news">
      <div className="evidence">
        <p className="banner banner--demo">
          <Icon name="info" size={16} />
          Simulated items - no live news feed, browser or API is connected. Publication time and observation time are shown separately.
        </p>
        {items.length ? (
          <ul className="newslist">
            {items.map((n) => (
              <li key={n.id} className={n.contradicts.length ? 'is-conflict' : ''}>
                <div className="newslist__head">
                  <strong>{n.headline}</strong>
                  {n.primary ? <span className="chip chip--best">primary source</span> : <span className="chip">report</span>}
                </div>
                <div className="small muted">{n.source}</div>
                <div className="small mono">
                  published {clock(n.publishedAt)} · observed {clock(n.observedAt)}
                </div>
                {n.contradicts.map((id) => (
                  <div key={id} className="small bad">
                    Contradicts: "{byId.get(id)?.headline ?? id}"
                  </div>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">No news items recorded.</p>
        )}
      </div>
    </Modal>
  );
}
