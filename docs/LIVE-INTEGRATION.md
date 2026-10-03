# Read-only local Live integration

## Current installation supersedes the previous source binding

The current installation binds the actual `armis-setup-runtime` journal with ten observed installed roles and recorded Operations → worker → review tasks. It no longer uses the single default Hermes-session binding described in the historical section below. Optional authenticated `/api/evidence` separately reads sanitized setup workflow/review/actual-model receipts and authorized read-only Uditus sources. See [MAC-LIVE-ACTIVATION.md](MAC-LIVE-ACTIVATION.md) for exact sources, producer/reader gaps, migration handoff and recovery. No administration policy update or demonstration starts during this activation.

## What exists

The pixel-art renderer is unchanged in design. Live is the default source, with no Demo identities or saved Demo tasks. `LiveAdapter` implements `WorkshopAdapter` over same-origin SSE. Redirect and controls are always false. Demo remains a separate, explicit simulation source used by regression tests; it is not opened for the user.

A single native Node HTTP service serves the production `dist/` manifest and three read-only API paths: `/api/health`, `/api/events`, and `/api/evidence`. It binds **127.0.0.1 only**, requires the exact Host, rejects foreign Origin/fetch-site and non-GET methods, and sets no permissive CORS. A top-level same-origin browser navigation establishes a random HttpOnly SameSite=Strict session cookie; no token enters frontend code, URLs or localStorage. The cookie is short-lived in the service's memory and invalidated when the service stops. No execution, terminal, filesystem, logs, raw databases or mutation endpoint exists. Static assets are an immutable startup allowlist; source maps are not served. Local OS users remain trusted: this is not isolation from another process running as the same Unix user.

## Actual source on the Ubuntu Mac mini

Two mutually exclusive opt-in sources are supported:

1. `ARMIS_VIEWER_DB`: an existing sanitized Armis `viewer_events` SQLite journal, contract version 1. This does not start an execution host or initialize a dispatcher database.
2. `ARMIS_HERMES_DB` plus `ARMIS_HERMES_SESSION_ID`: a read-only, explicitly bound Hermes default-profile session. This source selects only session identifiers/configured model label and tool-call identifiers, names and timestamps. SQLite extracts tool names; prompt, arguments, result content, reasoning and credentials are never selected for serialization. Unknown tool names become `unknown_tool`.

The previous October 2 installation was source 2, bound to this dashboard-connection Slack session: `20261002_162105_235c1110`. Its task grouping is explicitly an **integration test**, not a production mandate and not a replay fixture. Worker `hermes.default` is installed/observed but **not bound to an Armis role**. The viewer does not quietly relabel it as `armis.ceo`. Tool requested/returned timestamps are genuine runtime records; a returned tool or completed process is not accepted business success. Outcome stays unobserved. No review acceptance, business result, handoff or Ready transition is inferred from private messages or silence.

**Observed:** tool request/return metadata for the explicitly bound session, session/attempt/task identities, source timestamps, configured/requested model label. Source saves may lag execution; metadata is not token-stream visibility.

**Unobserved:** private model thinking or messages, raw output, unbound sessions/delegated workers, external/manual processes, provider quota and actual provider/model identity, production business records, signed acceptance and genuine business handoffs. Uditus, Etsy and Aster remain no-telemetry with no invented workers or paper positions. Source connectivity is not a worker heartbeat. This does not see all Hermes activity.

The existing host/multi-model assignment remains separate in `/home/connor/armis-control-integration`. Its concurrent worker-factory/catalog/quota implementation is not started or duplicated by this viewer. Only a future explicitly supplied, verified sanitized journal can connect its authority/business records. See `SOURCE-MAPPING.md` for inspected revisions and exact mappings.

## Manual start / stop / logs

Use Node 24+ with native SQLite and TypeScript stripping (verified here on Node 26.7.0), and the committed lockfile:

```sh
cd /home/connor/armis-workshop
npm ci
npm run build
ARMIS_HERMES_DB=/home/connor/.hermes/state.db \
ARMIS_HERMES_SESSION_ID=20261002_162105_235c1110 \
npm run serve:live
```

Open **http://127.0.0.1:4173** on the Mac mini itself. `localhost` is intentionally not accepted as an alternate Host. Keep this process running; **Ctrl+C** stops it. Startup/errors go to the launching terminal. This source binding must be changed deliberately when another session is authorized; no automatic discovery of other conversations occurs. No persistent startup, tunnel, public deployment or LAN binding is configured. Source configuration paths stay server-side and are not returned by health.

After a production build, stop/start the viewer so its immutable asset manifest uses the new files. Never restart the Hermes gateway just to rebuild this viewer. If the source cannot be read, health and Live stay visibly disconnected. A replaced or corrupted source fails closed; repair/rebind and manually restart the viewer. Health is authenticated: an unauthenticated command-line request receives 401; open the browser page first.

## Recovery contract v1

SSE names: `snapshot`, `events`, `heartbeat`. Each envelope carries `version:1`, epoch and cursor; event IDs are `epoch:cursor`. Snapshot includes `mode:'live'` and sanitized `observations`. Event batches include `previousCursor` and observations. SQLite reads snapshot records and cursor in one transaction, then reads greater cursors, preventing a snapshot/subscription gap. Source timestamps are preserved; browser store stamps `receivedTs` on incremental arrival.

Reconnect always reconstructs from a fresh consistent snapshot. It does not submit execution or replay historical handoffs as new animated activity. The adapter validates before applying, drops duplicate batches, rejects cursor gaps/out-of-order records, detects epochs/restarts, closes previous streams, cancels timers and ignores stopped-source callbacks. Browser clock ticks independently; quiet healthy heartbeats do not keep workers active. Loss of heartbeat makes the connection stale. Journal/snapshot history, messages, streams and buffers have hard bounds; exceeding a bound disconnects rather than dropping evidence and presenting plausible state. Current projection limit is 1,024 attempts and 10,000 observations per bound session; long sessions need a reviewed compaction contract before exceeding those bounds.

Runtime validation copies allowlisted fields and rejects malformed/unsafe/unsupported records. UI reports rejected records and contract mismatch. Live snapshots replace identity rather than retaining a simulated roster. Demo roster persistence is namespaced separately; actual-role appearances are deterministic from stable IDs, with identity never overridden by Demo names.

## Capacity

Independent session/week/RPM/input-TPM/RPD windows are supported, each with unit, scope, provenance, observation time and freshness. Shared pools remain shared. Live currently has no verified quota source, so quota is unknown; Subscription B is not configured until independently verified. A successful generation establishes connectivity only. Unknown/stale readings do not darken workers, Gemini eligibility is not suppressed by exhausted Codex, and passing a reset timestamp requires rechecking rather than asserting recovery.

## Verification

```sh
npm run typecheck
npm test
npm run build
PW_CHANNEL=chrome npm run test:e2e
```

Chrome is installed on this Ubuntu host. Browser tests use an isolated temporary browser profile, not the user's locked Chrome profile. Demo regression tests explicitly opt into Demo in their isolated pages; the user's page opens Live. Real-source tests require an explicitly bound Hermes source and are skipped rather than replaced with fixtures when unavailable.

Tests cover Live identity isolation, consistent snapshots and lifecycle projection, duplicates/out-of-order/gaps, disconnect/restart/timers, validation/secret exclusion, held-result preservation, independent quota windows, and disabled controls. Live browser tests check the real installed profile, task grouping and refresh reconstruction. A separate bounded smoke watches actual new request/return records arrive through SSE and verifies that the UI attempt count increases and survives refresh. There is **no claim of an observed independent review or accepted business result** until the runtime records those explicitly in an approved telemetry contract.

Production migrations, outbound messages/email, trading, billing, operational Uditus changes and model routing/activation are outside this integration.
