import type { Rng } from '../../core/rng';
import type { Candidate, LedgerBook, Millis, NewsItem, Position, Venue, VenueQuote } from '../../core/types';

/**
 * Aster Ledger paper book. Everything here is SIMULATED: prices, quotes,
 * positions, fills and news are illustrative, generated from a seeded RNG.
 * No venue, account, wallet, X/social data or paid API is contacted.
 */

export type LedgerScenario = 'normal' | 'stale-quotes' | 'conflicting' | 'failed-audit' | 'no-opportunity';

export const STARTING_BANKROLL = 20;
const FRESH_MS = 60_000;
const EDGE_THRESHOLD = 0.06;

export const VENUES: Venue[] = [
  { id: 'kalshi', name: 'Kalshi', jurisdiction: 'US exchange', note: 'Contract rules and settlement source are per-contract.', configured: true },
  {
    id: 'pm-intl',
    name: 'Polymarket (International)',
    jurisdiction: 'International platform',
    note: 'Distinct from Polymarket US: separate venue, separate contracts and rules.',
    configured: true,
  },
  {
    id: 'pm-us',
    name: 'Polymarket US',
    jurisdiction: 'US venue',
    note: 'Distinct from the international platform; a similarly named contract is not assumed identical.',
    configured: true,
  },
  { id: 'future-1', name: 'Future venue (configurable)', jurisdiction: 'Not configured', note: 'Adapter slot for a later venue. No quotes.', configured: false },
];

export interface CandidateTemplate {
  question: string;
  labels: Record<string, string>;
}

/** Fictional, illustrative questions. Not real markets. */
export const CANDIDATES: CandidateTemplate[] = [
  {
    question: 'Riverton transit levy approved by Friday? (fictional)',
    labels: { kalshi: 'Levy approved by Fri 17:00 local', 'pm-intl': 'Transit levy passes this week', 'pm-us': 'Riverton levy vote: approve' },
  },
  {
    question: 'Harbor storm closes port before Sunday? (fictional)',
    labels: { kalshi: 'Port closure order issued by Sat 23:59', 'pm-intl': 'Harbor port closed this weekend', 'pm-us': 'Port closure before Sunday' },
  },
  {
    question: 'Regional jobs report above 2.0%? (fictional)',
    labels: { kalshi: 'Jobs growth > 2.0% (first print)', 'pm-intl': 'Jobs report beats 2%', 'pm-us': 'Jobs growth above 2.0%' },
  },
  {
    question: 'Metro league final goes to overtime? (fictional)',
    labels: { kalshi: 'Final ends tied after regulation', 'pm-intl': 'Overtime in the league final', 'pm-us': 'League final: overtime' },
  },
  {
    question: 'Festival opener sells out on day one? (fictional)',
    labels: { kalshi: 'Opener sold out by 23:59 day one', 'pm-intl': 'Festival opener sells out', 'pm-us': 'Opener sell-out day one' },
  },
  {
    question: 'City marathon course record broken? (fictional)',
    labels: { kalshi: 'Official course record improved', 'pm-intl': 'Marathon record falls', 'pm-us': 'Course record broken' },
  },
];

export const TRADERS = ['@tidewatcher', '@quietbook', '@northbay_q', '@lowvol_lena'];

const SOURCES = ['Riverton Courier (simulated)', 'Regional Wire (simulated)', 'Official notice (simulated)', 'Local blog (simulated)'];

function round(n: number, d = 2) {
  const k = 10 ** d;
  return Math.round(n * k) / k;
}

export class LedgerModel {
  book: LedgerBook;
  private base = new Map<string, number>();
  private exitStep = 0;
  private newsN = 0;

  constructor(
    t0: Millis,
    private scenario: LedgerScenario,
    private rng: Rng,
  ) {
    this.book = {
      paper: true,
      startingBankroll: STARTING_BANKROLL,
      available: STARTING_BANKROLL,
      reserved: 0,
      realized: 0,
      unrealized: 0,
      drawdownPct: 0,
      peakEquity: STARTING_BANKROLL,
      equityHistory: [{ at: t0, equity: STARTING_BANKROLL }],
      operatingCosts: [
        { label: 'AI provider usage (this session)', amount: 0, provenance: 'estimated' },
        { label: 'Market data feeds', amount: 0, provenance: 'unknown' },
      ],
      venues: VENUES,
      candidates: {},
      news: [],
      traders: [],
      positions: [],
      sources: [
        { id: 'quotes', label: 'Venue quotes (simulated)', lastAt: t0, state: scenario === 'stale-quotes' ? 'stale' : 'fresh' },
        { id: 'news', label: 'News wire (simulated)', lastAt: t0, state: scenario === 'conflicting' ? 'conflicting' : 'fresh' },
        { id: 'traders', label: 'Public trader profiles (simulated)', lastAt: null, state: 'unknown' },
      ],
      history: [],
      updatedAt: t0,
    };
    this.seedPositions(t0);
  }

  /** Opening book: one position mid-exit (partial fill) and a cross-venue hedge pair. */
  private seedPositions(t: Millis) {
    const p1: Position = {
      id: 'pos-1',
      candidateId: 'seed-levy',
      contract: 'Levy approved by Fri 17:00 local (fictional)',
      venueId: 'kalshi',
      side: 'YES',
      qty: 6,
      avgPrice: 0.42,
      mark: 0.47,
      recommendation: 'reduce',
      rationale: 'Thesis mostly priced in; research suggests trimming size. Research recommendation only.',
      netExitValue: 0,
      liquidityWarning: 'Thin book: only ~2 contracts bid near the mark.',
      exit: { requestedQty: 6, filledQty: 2, status: 'partial', note: 'Simulated exit: 2 of 6 filled at 0.46; remainder resting.' },
    };
    const p2: Position = {
      id: 'pos-2',
      candidateId: 'seed-port',
      contract: 'Harbor port closed this weekend (fictional)',
      venueId: 'pm-intl',
      side: 'YES',
      qty: 5,
      avgPrice: 0.31,
      mark: 0.33,
      recommendation: 'hold',
      rationale: 'One leg of a cross-venue pair; value depends on both legs.',
      netExitValue: 0,
      pairedWith: 'pos-3',
      hedgeWarning: 'Exiting this leg alone breaks the hedge with pos-3. Contracts differ in wording; the pair is not a perfect hedge.',
    };
    const p3: Position = {
      id: 'pos-3',
      candidateId: 'seed-port',
      contract: 'Port closure order issued by Sat 23:59 (fictional)',
      venueId: 'kalshi',
      side: 'NO',
      qty: 5,
      avgPrice: 0.64,
      mark: 0.62,
      recommendation: 'hold',
      rationale: 'Opposite leg of pos-2 on a different venue and rule set.',
      netExitValue: 0,
      pairedWith: 'pos-2',
      hedgeWarning: 'Exiting this leg alone breaks the hedge with pos-2.',
    };
    const p4: Position = {
      id: 'pos-4',
      candidateId: 'seed-jobs',
      contract: 'Jobs growth > 2.0% (first print) (fictional)',
      venueId: 'kalshi',
      side: 'YES',
      qty: 3,
      avgPrice: 0.5,
      mark: 0.34,
      recommendation: 'close',
      rationale: 'Thesis weakened: mark fell well below entry. Research suggests closing. Recommendation only.',
      netExitValue: 0,
      liquidityWarning: 'Spread is wide (0.06); a close would cross it.',
    };
    this.book.positions = [p1, p2, p3, p4];
    this.seedEvidence(t);
    // 2 contracts of pos-1 already exited at 0.46
    p1.qty = 4;
    this.book.realized = round(2 * (0.46 - 0.42));
    const cost = 4 * 0.42 + 5 * 0.31 + 5 * 0.64 + 3 * 0.5;
    this.book.reserved = round(cost);
    this.book.available = round(STARTING_BANKROLL - cost - 2 * 0.42 + 2 * 0.46);
    this.book.history.push({ at: t, text: 'Opening paper book loaded (simulated).' });
    this.revalue(t);
  }

  /** Evidence for the opening positions so every position links to its sources. */
  private seedEvidence(t: Millis) {
    const seeds: [string, number, 'paper_entry'][] = [
      ['seed-levy', 0, 'paper_entry'],
      ['seed-port', 1, 'paper_entry'],
      ['seed-jobs', 2, 'paper_entry'],
    ];
    for (const [id, k] of seeds) {
      this.addCandidate(id, k, t - 20 * 60_000);
      const c = this.book.candidates[id]!;
      this.book.candidates[id] = { ...c, decision: 'paper_entry', reason: 'Opening paper position (seeded for the demo)', estimate: 0.5 };
    }
  }

  private quotesFor(taskId: string, tpl: CandidateTemplate, t: Millis): VenueQuote[] {
    const p = 0.25 + this.rng.next() * 0.5;
    this.base.set(taskId, p);
    return VENUES.map((v) => {
      if (!v.configured) {
        return { venueId: v.id, contractLabel: '-', ruleCompat: 'unverified', ruleNote: 'Venue not configured', bid: null, ask: null, feePct: null, depth: null, quoteAt: null, netAsk: null };
      }
      const spread = 0.02 + this.rng.next() * 0.04;
      const ask = round(Math.min(0.97, p + spread / 2 + (this.rng.next() - 0.5) * 0.04));
      const feePct = v.id === 'kalshi' ? 1.5 : v.id === 'pm-us' ? 1 : 0.5;
      const compatRoll = this.rng.next();
      const ruleCompat: VenueQuote['ruleCompat'] = v.id === 'kalshi' ? 'compatible' : compatRoll < 0.45 ? 'differs' : compatRoll < 0.7 ? 'unverified' : 'compatible';
      const age = this.scenario === 'stale-quotes' ? 300_000 + this.rng.int(0, 60_000) : this.rng.int(2_000, 25_000);
      return {
        venueId: v.id,
        contractLabel: tpl.labels[v.id] ?? tpl.question,
        ruleCompat,
        ruleNote:
          ruleCompat === 'compatible'
            ? 'Resolution source and cutoff match the candidate thesis'
            : ruleCompat === 'differs'
              ? 'Different cutoff time or resolution source - not the same contract'
              : 'Rules not yet verified',
        bid: round(ask - spread),
        ask,
        feePct,
        depth: this.rng.int(8, 320),
        quoteAt: t - age,
        netAsk: round(ask * (1 + feePct / 100), 3),
      };
    });
  }

  private best(c: Candidate, t: Millis): VenueQuote | null {
    const ok = c.quotes.filter((q) => q.ruleCompat === 'compatible' && q.netAsk !== null && q.quoteAt !== null && t - q.quoteAt < FRESH_MS);
    ok.sort((a, b) => a.netAsk! - b.netAsk!);
    return ok[0] ?? null;
  }

  /** Feeds stage: a new candidate appears with news and venue quotes. */
  addCandidate(taskId: string, tplIndex: number, t: Millis) {
    const tpl = CANDIDATES[tplIndex % CANDIDATES.length]!;
    const quotes = this.quotesFor(taskId, tpl, t);
    const news: NewsItem[] = [];
    const n1: NewsItem = {
      id: `news-${++this.newsN}`,
      headline: `${tpl.question.replace(' (fictional)', '').replace('?', '')}: officials comment`,
      source: SOURCES[2]!,
      primary: true,
      publishedAt: t - this.rng.int(60_000, 600_000),
      observedAt: t - this.rng.int(1_000, 30_000),
      contradicts: [],
      candidateId: taskId,
    };
    news.push(n1);
    const n2: NewsItem = {
      id: `news-${++this.newsN}`,
      headline: `Report: ${tpl.question.replace(' (fictional)', '').replace('?', '').toLowerCase()} looks likely`,
      source: SOURCES[this.rng.int(0, 1)]!,
      primary: false,
      publishedAt: t - this.rng.int(30_000, 300_000),
      observedAt: t - this.rng.int(1_000, 20_000),
      contradicts: [],
      candidateId: taskId,
    };
    news.push(n2);
    if (this.scenario === 'conflicting') {
      const n3: NewsItem = {
        id: `news-${++this.newsN}`,
        headline: `Denial: no decision yet on ${tpl.question.replace(' (fictional)', '').replace('?', '').toLowerCase()}`,
        source: SOURCES[3]!,
        primary: false,
        publishedAt: t - this.rng.int(10_000, 120_000),
        observedAt: t - this.rng.int(1_000, 10_000),
        contradicts: [n2.id],
        candidateId: taskId,
      };
      n2.contradicts.push(n3.id);
      news.push(n3);
    }
    this.book.news = this.trimNews([...news, ...this.book.news]);
    this.book.candidates = {
      ...this.book.candidates,
      [taskId]: { taskId, question: tpl.question, side: 'YES', quotes, bestVenueId: null, decision: 'pending', newsIds: news.map((x) => x.id) },
    };
    this.trimCandidates();
    this.touchSource('quotes', t);
    this.touchSource('news', t);
    this.book.updatedAt = t;
  }

  /** Bounded news, but never evict evidence for open positions or candidates still in flight. */
  private trimNews(list: NewsItem[]): NewsItem[] {
    const keep = new Set([...this.book.positions.map((p) => p.candidateId), ...Object.values(this.book.candidates).filter((c) => c.decision === 'pending').map((c) => c.taskId)]);
    const out: NewsItem[] = [];
    let free = 0;
    for (const n of list) {
      if (n.candidateId && keep.has(n.candidateId)) out.push(n);
      else if (free++ < 30) out.push(n);
    }
    return out;
  }

  private trimCandidates() {
    const ids = Object.keys(this.book.candidates);
    if (ids.length <= 30) return;
    const c = { ...this.book.candidates };
    const held = new Set(this.book.positions.map((p) => p.candidateId));
    const removable = ids.filter((id) => c[id]!.decision !== 'pending' && !held.has(id));
    for (const id of removable.slice(0, ids.length - 30)) delete c[id];
    this.book.candidates = c;
  }

  private touchSource(id: string, t: Millis) {
    if (id === 'quotes') return this.deriveQuoteFreshness(t);
    this.book.sources = this.book.sources.map((s) => (s.id === id ? { ...s, lastAt: t } : s));
  }

  research(taskId: string, t: Millis) {
    const c = this.book.candidates[taskId];
    if (!c) return;
    const p = this.base.get(taskId) ?? 0.5;
    const estimate = round(Math.max(0.03, Math.min(0.97, p + (this.rng.next() - 0.35) * 0.22)));
    this.book.candidates = { ...this.book.candidates, [taskId]: { ...c, estimate } };
    this.book.updatedAt = t;
  }

  /** Re-quotes a candidate (simulated). In the stale-quotes scenario quotes do not refresh. */
  private requote(taskId: string, t: Millis) {
    const c = this.book.candidates[taskId];
    if (!c || this.scenario === 'stale-quotes') return;
    const quotes = c.quotes.map((q) => {
      if (q.ask === null) return q;
      const ask = round(Math.max(0.02, Math.min(0.98, q.ask + (this.rng.next() - 0.5) * 0.02)));
      const spread = (q.ask ?? 0) - (q.bid ?? 0);
      return { ...q, ask, bid: round(ask - spread), netAsk: round(ask * (1 + (q.feePct ?? 0) / 100), 3), quoteAt: t - this.rng.int(1_000, 15_000) };
    });
    this.book.candidates = { ...this.book.candidates, [taskId]: { ...c, quotes } };
  }

  /** Rules verification. Returns a rejection reason, or null to continue. */
  rules(taskId: string, t: Millis): string | null {
    this.requote(taskId, t);
    const c = this.book.candidates[taskId];
    if (!c) return 'Candidate not found';
    if (this.scenario === 'conflicting') return 'Conflicting sources: the primary report is contradicted by a later report';
    if (!c.quotes.some((q) => q.ruleCompat === 'compatible')) return 'No venue contract matches the thesis rules';
    this.book.updatedAt = t;
    return null;
  }

  /** Independent audit. Returns a rejection reason, or null to continue. */
  audit(taskId: string, t: Millis, failedAudit: boolean): string | null {
    this.requote(taskId, t);
    const c = this.book.candidates[taskId];
    if (!c) return 'Candidate not found';
    if (this.scenario === 'stale-quotes' || !this.best(c, t)) return 'Quotes older than 60 s - cannot verify an executable price';
    if (failedAudit) return 'Audit failed: research cited a secondary report as the primary source';
    return null;
  }

  /** Paper portfolio decision. Most candidates are not traded. */
  decide(taskId: string, t: Millis): { entry: boolean; reason: string } {
    this.requote(taskId, t);
    const c = this.book.candidates[taskId];
    if (!c) return { entry: false, reason: 'Candidate not found' };
    const best = this.best(c, t);
    const edge = best && c.estimate !== undefined ? c.estimate - best.netAsk! : -1;
    let entry = this.scenario !== 'no-opportunity' && best !== null && edge > EDGE_THRESHOLD;
    const qty = best ? Math.max(1, Math.floor(Math.min(3, this.book.available * 0.15) / best.netAsk!)) : 0;
    const cost = best ? qty * best.netAsk! : 0;
    if (entry && cost > this.book.available) entry = false;
    const reason = !best
      ? 'No compatible, fresh quote'
      : this.scenario === 'no-opportunity'
        ? `No eligible opportunity: edge ${edge.toFixed(2)} after fees does not clear the threshold`
        : entry
          ? `Paper entry: ${qty} @ ${best.netAsk!.toFixed(3)} net on ${VENUES.find((v) => v.id === best.venueId)?.name} (best observed net price)`
          : `No trade: edge ${edge.toFixed(2)} after fees is below ${EDGE_THRESHOLD.toFixed(2)}`;
    this.book.candidates = { ...this.book.candidates, [taskId]: { ...c, bestVenueId: best?.venueId ?? null, decision: entry ? 'paper_entry' : 'no_trade', reason } };
    if (entry && best) {
      const pos: Position = {
        id: `pos-${taskId}`,
        candidateId: taskId,
        contract: `${best.contractLabel} (fictional)`,
        venueId: best.venueId,
        side: c.side,
        qty,
        avgPrice: best.netAsk!,
        mark: best.bid ?? best.netAsk!,
        recommendation: 'hold',
        rationale: 'New paper entry; thesis under watch. Research recommendation only.',
        netExitValue: 0,
        liquidityWarning: (best.depth ?? 0) < 30 ? 'Low depth: a full exit may not fill at the mark.' : undefined,
      };
      // open positions are never trimmed: their cost stays in reserved until they close
      this.book.positions = [...this.book.positions, pos];
      this.book.available = round(this.book.available - cost);
      this.book.reserved = round(this.book.reserved + cost);
      this.book.history = [...this.book.history, { at: t, text: reason }].slice(-40);
    } else {
      this.book.history = [...this.book.history, { at: t, text: `${c.question}: ${reason}` }].slice(-40);
    }
    this.revalue(t);
    return { entry, reason };
  }

  /** Records a candidate rejected before the portfolio stage. */
  reject(taskId: string, t: Millis, reason: string) {
    const c = this.book.candidates[taskId];
    if (c) this.book.candidates = { ...this.book.candidates, [taskId]: { ...c, decision: 'rejected', reason } };
    this.book.history = [...this.book.history, { at: t, text: `Rejected: ${c?.question ?? taskId} - ${reason}` }].slice(-40);
    this.book.updatedAt = t;
  }

  addTrader(handle: string, t: Millis) {
    const summaries = [
      'Public profile shows mostly small, short-dated positions; claims are not independently verified.',
      'Posts frequent commentary; observed public positions skew toward weather and civic markets.',
      'Public history is sparse; insufficient evidence to weight their views.',
    ];
    this.book.traders = [
      { id: `tr-${handle}-${t}`, handle: `${handle} (illustrative)`, summary: summaries[this.rng.int(0, summaries.length - 1)]!, observedAt: t, source: 'Public profile summary (simulated - no X/social data collected)' },
      ...this.book.traders,
    ].slice(0, 8);
    this.book.sources = this.book.sources.map((s) => (s.id === 'traders' ? { ...s, lastAt: t, state: 'fresh' } : s));
    this.book.updatedAt = t;
  }

  addOperatingCost(amount: number) {
    this.book.operatingCosts = this.book.operatingCosts.map((c, i) => (i === 0 ? { ...c, amount: round(c.amount + amount, 3) } : c));
  }

  /** Periodic mark-to-market (simulated prices) and the partial-exit demo. */
  tick(t: Millis) {
    this.book.positions = this.book.positions.map((p) => ({ ...p, mark: round(Math.max(0.02, Math.min(0.98, p.mark + (this.rng.next() - 0.5) * 0.02))) }));
    this.exitStep++;
    const p1 = this.book.positions.find((p) => p.id === 'pos-1');
    if (p1?.exit && p1.exit.status === 'partial' && this.exitStep === 4) {
      // one more small fill; the rest keeps resting - exits do not always complete
      const price = round(p1.mark - 0.01);
      p1.qty -= 1;
      p1.exit = { ...p1.exit, filledQty: p1.exit.filledQty + 1, note: `Simulated exit: ${p1.exit.filledQty + 1} of 6 filled; latest at ${price.toFixed(2)}. Remainder resting.` };
      this.book.realized = round(this.book.realized + (price - p1.avgPrice));
      this.book.reserved = round(this.book.reserved - p1.avgPrice);
      this.book.available = round(this.book.available + price);
      this.book.history = [...this.book.history, { at: t, text: `Simulated partial fill on pos-1 at ${price.toFixed(2)}` }].slice(-40);
    }
    this.deriveQuoteFreshness(t);
    this.reevaluate();
    this.revalue(t);
  }

  /** The quotes source is as fresh as the newest quote actually held - never fresher. */
  private deriveQuoteFreshness(t: Millis) {
    let newest: number | null = null;
    for (const c of Object.values(this.book.candidates)) for (const q of c.quotes) if (q.quoteAt !== null && (newest === null || q.quoteAt > newest)) newest = q.quoteAt;
    const state = newest === null ? 'unknown' : t - newest < FRESH_MS ? 'fresh' : 'stale';
    this.book.sources = this.book.sources.map((s) => (s.id === 'quotes' ? { ...s, lastAt: newest, state } : s));
  }

  /** Research recommendations follow the simulated marks (hold / reduce / close). */
  private reevaluate() {
    this.book.positions = this.book.positions.map((p) => {
      if (p.pairedWith) return p; // hedge legs are judged as a pair, not individually
      if (p.exit?.status === 'partial') return p; // an exit in progress keeps its recommendation
      const gain = (p.mark - p.avgPrice) / p.avgPrice;
      const rec = gain < -0.25 ? 'close' : gain > 0.1 ? 'reduce' : 'hold';
      const rationale =
        rec === 'close'
          ? 'Thesis weakened: mark fell well below entry. Research suggests closing. Recommendation only.'
          : rec === 'reduce'
            ? 'Thesis mostly priced in; research suggests trimming size. Recommendation only.'
            : 'Thesis intact; research suggests holding. Recommendation only.';
      return { ...p, recommendation: rec, rationale };
    });
  }

  private revalue(t: Millis) {
    let unreal = 0;
    this.book.positions = this.book.positions.map((p) => {
      unreal += (p.mark - p.avgPrice) * p.qty;
      return { ...p, netExitValue: round(p.qty * p.mark * 0.99) };
    });
    this.book.unrealized = round(unreal);
    const equity = round(this.book.available + this.book.reserved + this.book.unrealized);
    const hist = [...this.book.equityHistory, { at: t, equity }].slice(-60);
    const peak = Math.max(this.book.peakEquity, equity);
    this.book.peakEquity = peak;
    this.book.equityHistory = hist;
    this.book.drawdownPct = round(Math.max(0, ((peak - equity) / peak) * 100), 1);
    this.book.updatedAt = t;
  }

  snapshot(): LedgerBook {
    return structuredClone(this.book);
  }
}
