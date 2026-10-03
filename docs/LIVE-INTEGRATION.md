# Live integration contract

The browser has a read-only SSE adapter in `src/adapters/live.ts`. Set `VITE_ARMIS_BRIDGE_URL` to an explicitly supplied HTTP(S) telemetry endpoint, restart Vite, and select Live. Without configuration, `DisconnectedLiveAdapter` reports disconnected. No Mac mini endpoint has been supplied or verified. The browser never contacts providers or trading venues directly.

The endpoint returns `text/event-stream`, using ordinary SSE `data:` messages containing JSON. Its first message, and the first message after each reconnect, must be `{ "type": "snapshot", "snapshot": <Snapshot> }`. Later messages are `{ "type": "events", "events": <ActivityEvent[]> }`. Contracts are in `src/core/types.ts`; snapshots include all required collections, including empty ones. Every snapshot must reflect verified runtime observations, not simulation. The bridge maps Control business IDs explicitly to city IDs and stable role IDs to observed session/attempt IDs.

The viewer uses credentialed EventSource requests. Configure same-origin authentication or credentialed CORS for the viewer origin; never place secrets in the Vite bundle or endpoint URL. A valid snapshot establishes connection. Errors or invalid messages make telemetry unconfirmed and suppress event batches until another snapshot arrives. Arrival timestamps are assigned by the browser. Unknown identities, duplicate snapshot records, cross-company assignments and implausibly future timestamps are rejected. Live redirects and controls are disabled.

## Intended shape

```
Hermes runtime hooks (verified) ─┐
Durable job records (verified) ──┼─► small authenticated bridge on the Mac mini ──► sanitized SSE/WebSocket ──► browser LiveAdapter
Provider rate-limit headers ─────┘        (read-only by default)
```

- **The bridge** runs on the Ubuntu Mac mini. It reads **verified** runtime hooks and durable job records, sanitizes them (dropping prompts, private reasoning and secrets), and maps them into the `ActivityEvent` / `Snapshot` contracts in `src/core/types.ts`.
- **The browser** never talks to Hermes or providers directly. It only receives sanitized events.

## Checklist before connecting

1. [ ] **Confirm the real hooks.** Inspect the current Uditus/Hermes repository read-only and record the git ref. Use `packages/core/workshop.ts` and `docs/workshop.md` for the stage names (create, review, repair) and the bounded-repair semantics. Do not rely on the local snapshot at `566fecd`.
2. [ ] **Define explicit mappings.** Map business id → `BUSINESSES` entry, and job stage → `TaskStage`/department. Never infer a business from prompt text.
3. [ ] **Keep identity separate.** Bind stable worker identity separately from runtime session and attempt ids.
4. [ ] **Build the bridge.** Implement it with authentication (a local token or mTLS; no credentials in the browser bundle) and read-only scopes. Bind it to the LAN or localhost only.
5. [ ] **Event semantics.**
   - The bridge emits a snapshot on connect and on reconnect.
   - Every event carries a unique id and a source timestamp; the viewer stamps `receivedTs` itself.
6. [ ] **Unknown values.** Send unknown states as `unknown`. A missing completion stays unobserved, never assumed.
7. [ ] **Capacity provenance.**
   - Report remaining allowance only from provider headers or APIs (`provider_reported`).
   - Request and token counts are `locally_measured`.
   - Never infer quota from catalog visibility or from successful requests.
8. [ ] **Redirect.** Only after a separate review, add a narrowly scoped redirect endpoint that targets one worker and one task. It must return acknowledged, then applied or rejected. There is no arbitrary command endpoint and no terminal.
9. [x] **Implement `LiveAdapter`.** Read-only SSE transport and boundary tests exist; they use simulated fixtures, not a recorded real stream.
10. [ ] **Test with the real stream.** Exercise de-duplication, out-of-order delivery, stale data and reconnect snapshots against a recorded real stream.
11. [ ] **Aster Ledger.** Venue, news and trader adapters are future work. Any real-money capability needs its own design and authorization review; the viewer must keep showing DEMO/PAPER until then.
12. [ ] **Don't touch safety controls.** Leave Uditus kill switches, compliance, suppression and authorization logic unchanged; the viewer only observes them.

## Audited Control contracts

`src/adapters/control.ts` pins the inspected armis-control registry and explicitly maps Control business IDs to city businesses. Its pure snapshot and event projections validate the boundary, preserve missing stage/session/repair information as unreported, and never manufacture executive activity. `OrganizationPanel` renders declared ownership, delegation and mandates independently from observed worker sessions.

The projections and SSE client exist. The live source remains disconnected without configuration, and unconfirmed until the Mac mini bridge supplies a valid snapshot. Control budgets, pool state, leases and locks are not currently displayed as observed telemetry. A real stream still needs to be connected and exercised before live fidelity can be claimed.

## Connections tab and source health

The Connections tab independently tracks accepted snapshots/events, rejected messages, last arrival, last valid data and the configured endpoint origin. Demo data never verifies a live source. A connected transport is not evidence that every underlying feed works.

After a validated snapshot, the bridge may send `{"type":"health","feeds":[...]}`. Each report has `id` (from `FEEDS` in `src/core/connections.ts`), `status` (`ok`, `error`, `not_configured`), `checkedAt` (epoch milliseconds), `lastRecordAt` (epoch milliseconds or null), `records` (nonnegative integer for the bridge's observation window), and a sanitized `detail` (at most 500 characters).

Emit reports about every 15 seconds after checking the actual source reader. `ok` means the source check and mapping succeeded, including legitimate empty/quiet sources; it must never mean a planned connection, synthetic fixture or merely an open socket. Report source failures explicitly. Health checks expire after 45 seconds. Transport evidence expires after 90 seconds. Reconnecting, invalid messages and source changes suppress green status; a new snapshot clears prior feed reports. The bridge must also validate source-to-city identities and semantics. This dashboard cannot prove that a remote producer's claims are truthful without real-stream tests.

The single terminal block in `public/mac-mini-diagnostics.txt` collects read-only installation, repository, service, process-name, port and storage-schema information. It does not install a bridge or claim any source is connected. Configuration contents, credentials and session text are excluded. Return its output to identify the installed runtime and implement verified readers before deploying the bridge.
