import type { Candidate, LedgerBook, Millis, Position, VenueQuote } from '../core/types';
import { ProvTag } from './CapacityPanel';
import { clock, relTime } from './format';
import { Icon } from './Icon';
import { ui, useWorkshop } from './store';

/**
 * Aster Ledger paper-trading panels. Everything is simulated; there is
 * deliberately no control that places, sizes or confirms a real order.
 */

const usd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;

export function PaperBanner() {
  return (
    <div className="paper-banner" role="note">
      <strong>DEMO · PAPER TRADING</strong>
      <span>Simulated prices, positions and fills. No real money, accounts, wallets or venue connections.</span>
    </div>
  );
}

function Spark({ points }: { points: { at: Millis; equity: number }[] }) {
  if (points.length < 2) return null;
  const w = 320;
  const h = 44;
  const min = Math.min(...points.map((p) => p.equity));
  const max = Math.max(...points.map((p) => p.equity));
  const span = Math.max(0.01, max - min);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p.equity - min) / span) * (h - 6) - 3).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Paper equity from ${usd(points[0]!.equity)} to ${usd(points[points.length - 1]!.equity)}`}>
      <path d={d} fill="none" stroke="#5fe3d0" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function BookSummary({ book }: { book: LedgerBook }) {
  const equity = book.available + book.reserved + book.unrealized;
  const stat = (label: string, value: string, cls = '') => (
    <div className="stat">
      <span className="stat__l">{label}</span>
      <span className={`stat__v mono ${cls}`}>{value}</span>
    </div>
  );
  return (
    <section aria-labelledby="book-h">
      <h3 id="book-h" className="sub">
        Paper book <span className="chip chip--paper">simulated</span>
      </h3>
      <div className="stats">
        {stat('Start bankroll', usd(book.startingBankroll))}
        {stat('Paper equity', usd(equity))}
        {stat('Available', usd(book.available))}
        {stat('Reserved', usd(book.reserved))}
        {stat('Realized P&L', signed(book.realized), book.realized >= 0 ? 'ok' : 'bad')}
        {stat('Unrealized P&L', signed(book.unrealized), book.unrealized >= 0 ? 'ok' : 'bad')}
        {stat('Drawdown', `${book.drawdownPct.toFixed(1)}%`, book.drawdownPct > 5 ? 'warn' : '')}
      </div>
      <Spark points={book.equityHistory} />
      <h4 className="sub sub--small">Operating costs (kept separate from P&L)</h4>
      <ul className="plain">
        {book.operatingCosts.map((c) => (
          <li key={c.label}>
            {c.label}: <span className="mono">{c.provenance === 'unknown' ? 'unknown' : usd(c.amount)}</span> <ProvTag p={c.provenance} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sources({ book, now }: { book: LedgerBook; now: Millis }) {
  return (
    <section aria-labelledby="src-h">
      <h3 id="src-h" className="sub">
        Source freshness
      </h3>
      <ul className="plain">
        {book.sources.map((s) => (
          <li key={s.id} className="srcrow">
            <span className={`fresh fresh--${s.state}`}>{s.state}</span>
            <span>{s.label}</span>
            <span className="muted small">{s.lastAt ? relTime(now, s.lastAt) : 'never'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function quoteAge(now: Millis, q: VenueQuote) {
  if (q.quoteAt === null) return { text: '-', stale: false };
  const s = Math.round((now - q.quoteAt) / 1000);
  return { text: s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`, stale: s >= 60 };
}

export function VenueBoard({ book, candidate, now }: { book: LedgerBook; candidate: Candidate; now: Millis }) {
  return (
    <section aria-labelledby={`vb-${candidate.taskId}`}>
      <h3 id={`vb-${candidate.taskId}`} className="sub">
        Venue comparison
      </h3>
      <div className="small muted">
        {candidate.question} · side {candidate.side}
        {candidate.estimate !== undefined ? ` · research estimate ${candidate.estimate.toFixed(2)}` : ''}
      </div>
      <div className="vboard" role="table" aria-label="Venue comparison (illustrative quotes)">
        <div className="vboard__row vboard__head" role="row">
          <span role="columnheader">Venue</span>
          <span role="columnheader">Bid / Ask</span>
          <span role="columnheader">Fee · Net</span>
          <span role="columnheader">Depth · Age</span>
        </div>
        {candidate.quotes.map((q) => {
          const v = book.venues.find((x) => x.id === q.venueId)!;
          const age = quoteAge(now, q);
          const best = candidate.bestVenueId === q.venueId;
          return (
            <div key={q.venueId} className={`vboard__row ${best ? 'is-best' : ''} ${v.configured ? '' : 'is-off'}`} role="row">
              <span role="cell" className="vboard__venue">
                <strong>{v.name}</strong>
                <span className="small muted">{v.jurisdiction}</span>
                <span className="small">“{q.contractLabel}”</span>
                <span className={`compat compat--${q.ruleCompat}`} title={q.ruleNote}>
                  rules: {q.ruleCompat}
                </span>
                {best ? <span className="chip chip--best">Best observed net price</span> : null}
              </span>
              <span role="cell" className="mono">
                {q.bid === null ? '-' : `${q.bid.toFixed(2)} / ${q.ask!.toFixed(2)}`}
              </span>
              <span role="cell" className="mono">
                {q.feePct === null ? '-' : `${q.feePct}% · ${q.netAsk!.toFixed(3)}`}
              </span>
              <span role="cell" className="mono">
                {q.depth === null ? '-' : q.depth} · <span className={age.stale ? 'bad' : ''}>{age.text}{age.stale ? ' stale' : ''}</span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="small muted">
        Illustrative quotes. Each venue's contract is compared on its own wording; similarly named contracts are not assumed identical. Polymarket (International) and Polymarket US are separate venues. "Best observed net price" means best among compatible, fresh quotes seen here - not best odds anywhere.
      </p>
      {candidate.decision !== 'pending' ? (
        <p className={`note ${candidate.decision === 'paper_entry' ? 'note--ok' : ''}`}>
          <strong>{candidate.decision === 'paper_entry' ? 'Paper entry' : candidate.decision === 'no_trade' ? 'No trade' : 'Rejected'}:</strong> {candidate.reason}
        </p>
      ) : null}
      <button className="btn btn--sm" onClick={() => ui.update({ newsFor: candidate.taskId })}>
        <Icon name="doc" size={14} /> News & evidence for this candidate
      </button>
    </section>
  );
}

function PositionCard({ p, book }: { p: Position; book: LedgerBook }) {
  const v = book.venues.find((x) => x.id === p.venueId);
  const pnl = (p.mark - p.avgPrice) * p.qty;
  return (
    <li className="pos">
      <div className="pos__head">
        <strong>{p.contract}</strong>
        <span className={`reco reco--${p.recommendation}`}>{p.recommendation}</span>
      </div>
      <div className="small muted">
        {v?.name} · {p.side} · {p.qty} @ {p.avgPrice.toFixed(2)} · mark {p.mark.toFixed(2)} · <span className={pnl >= 0 ? 'ok' : 'bad'}>{signed(pnl)}</span>
      </div>
      <div className="small">{p.rationale}</div>
      <div className="small">
        Simulated net exit value: <span className="mono">{usd(p.netExitValue)}</span>
      </div>
      {p.exit ? <div className="small warn">{p.exit.note}</div> : null}
      {p.liquidityWarning ? <div className="small warn">⚠ {p.liquidityWarning}</div> : null}
      {p.hedgeWarning ? <div className="small bad">⚠ {p.hedgeWarning}</div> : null}
    </li>
  );
}

export function LedgerPanel({ businessId }: { businessId: string }) {
  const state = useWorkshop((s) => s);
  const book = state.ledger[businessId];
  if (!book) return <p className="empty">No paper book observed.</p>;
  const candidates = Object.values(book.candidates);
  const focus = [...candidates].reverse().find((c) => c.decision !== 'pending') ?? candidates[candidates.length - 1];
  return (
    <section className="ledger" aria-label="Aster Ledger paper trading">
      <PaperBanner />
      <BookSummary book={book} />
      <h3 className="sub">Positions · research recommendations</h3>
      <ul className="plain">
        {book.positions.map((p) => (
          <PositionCard key={p.id} p={p} book={book} />
        ))}
      </ul>
      <p className="small muted">Recommendations are research output only. This viewer has no order controls; nothing can be placed, sized or closed from here.</p>
      {focus ? <VenueBoard book={book} candidate={focus} now={state.now} /> : null}
      <Sources book={book} now={state.now} />
      <h3 className="sub">Public trader research</h3>
      <ul className="plain">
        {book.traders.length ? (
          book.traders.map((t) => (
            <li key={t.id} className="trader">
              <strong>{t.handle}</strong> <span className="muted small">{relTime(state.now, t.observedAt)}</span>
              <div className="small">{t.summary}</div>
              <div className="small muted">{t.source}</div>
            </li>
          ))
        ) : (
          <li className="muted">None yet.</li>
        )}
      </ul>
      <h3 className="sub">Portfolio history</h3>
      <ol className="timeline">
        {book.history
          .slice(-8)
          .reverse()
          .map((h, i) => (
            <li key={`${h.at}-${i}`} className="tl">
              <time className="mono">{clock(h.at)}</time>
              <span>{h.text}</span>
            </li>
          ))}
      </ol>
      <button className="btn" onClick={() => ui.update({ newsFor: 'all' })}>
        <Icon name="doc" /> Open news & evidence drawer
      </button>
    </section>
  );
}

export function CandidateDetail({ businessId, taskId }: { businessId: string; taskId: string }) {
  const state = useWorkshop((s) => s);
  const book = state.ledger[businessId];
  const c = book?.candidates[taskId];
  if (!book || !c) return null;
  return (
    <>
      <PaperBanner />
      <VenueBoard book={book} candidate={c} now={state.now} />
    </>
  );
}
