import type { ActivityEvent, ConnectionState, Millis, RedirectRequest, Snapshot } from '../core/types';

/** Where adapters deliver data. The store implements this. */
export interface AdapterSink {
  snapshot(snapshot: Snapshot, connection: ConnectionState): void;
  events(events: ActivityEvent[]): void;
  connection(state: ConnectionState): void;
  tick(now: Millis): void;
  /** Discards all observed state (roster identity is kept). Used on demo replay. */
  reset(): void;
}

export interface RedirectResult {
  accepted: boolean;
  reason?: string;
}

/**
 * Contract every data source implements. The viewer never talks to a provider
 * or agent directly; it only consumes snapshots and sanitized events.
 */
export interface WorkshopAdapter {
  readonly kind: 'demo' | 'live';
  readonly label: string;
  readonly capabilities: { redirect: boolean; controls: boolean };
  start(sink: AdapterSink): void;
  stop(): void;
  /** Current source-clock time, for smooth animation between ticks. */
  clock(): Millis;
  requestRedirect(request: RedirectRequest): RedirectResult;
}

/**
 * The live adapter as it exists tonight: not connected, by design.
 *
 * A future implementation will open an authenticated stream to a small bridge
 * on the Mac that reads verified Hermes runtime hooks plus durable job records
 * and forwards sanitized snapshots/events (see docs/LIVE-INTEGRATION.md). No
 * endpoint is guessed here, so nothing is contacted.
 */
export class DisconnectedLiveAdapter implements WorkshopAdapter {
  readonly kind = 'live' as const;
  readonly label = 'Live (not connected)';
  readonly capabilities = { redirect: false, controls: false };
  private timer: ReturnType<typeof setInterval> | null = null;

  start(sink: AdapterSink): void {
    sink.connection('disconnected');
    sink.tick(Date.now());
    this.timer = setInterval(() => sink.tick(Date.now()), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  clock(): Millis {
    return Date.now();
  }

  requestRedirect(): RedirectResult {
    return { accepted: false, reason: 'Live bridge is not connected. Redirect is disabled.' };
  }
}
