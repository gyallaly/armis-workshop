# Operational Connections — installed Armis/Uditus scope

This inventory covers all 23 diagnostic feeds. Green means a successful fresh read of the **named boundary**, not general service qualification, provider capacity, or permission to execute. Required feeds can be partial when a necessary piece of evidence is unavailable. Nothing here enables Uditus, sending, trading, or paid API spending.

## Feed inventory

- **runtime — Required.** Observe the Managing Director's actual current activity. Source: read-only native Hermes SessionDB, explicitly bound default-profile Slack thread. Quiet becomes idle. It is not a provider-availability check.
- **organization — Required for installed identities.** Identify installed role IDs separately from workers executing. Source: real `source.connected` entries in the setup journal. Full company/reporting-line telemetry is future functionality and is explicitly not configured.
- **workers — Required.** Understand work, waits, held failures, and idle. Sources: native current task plus setup workflow/call rows. Profiles and heartbeats never create workers. Persisted running calls without settlement remain unknown.
- **sessions — Required.** Correlate native sessions with recorded delegation attempts. Sources: native session identity and actual receipt `runtimeSessionId`. Missing finish or identity receipts stay unknown.
- **jobs — Required.** See work queues, stages and blockers. Sources: setup workflows and authenticated exact-project Uditus `workshop_tasks` / `agent_jobs` reads. Empty tables are readable, not an executed pipeline.
- **progress — Required.** Distinguish completion from independent acceptance. Source: recorded setup workflow outcomes and review verdicts. The completed acceptance task is only read, never replayed.
- **handoffs — Required for installed delegation.** See operations → execution → independent review assignments. Source: actual setup call `workflow`, `phase`, and `role` columns. Cross-department transport is not configured.
- **tools — Required.** Observe bounded sanitized native tool-step metadata. Source: the bound Hermes SessionDB turn. Inputs, outputs, reasoning, and prompts are withheld; tool steps are not workers.
- **quality — Required.** Expose independent reviews and retained failures. Sources: setup review verdicts and Uditus `workshop_attempts`. No Uditus task-family quality is claimed from an empty attempt table.
- **artifacts — Required.** Verify durable deliverable retention. Source: Armis remote artifact digest/count read-back cache. A retained text receipt does not independently validate every filesystem or published effect it describes.
- **capacity — Required, PARTIAL.** Distinguish observed model/provider routing from configured candidates and persisted cooldowns. Sources: actual setup receipts, runtime `cooldown`, and read-only Uditus model-registry metadata. Current model availability, remaining quota, reset replenishment and shared-pool capacity have no supported source and stay unknown. No model generations are used for health polling.
- **usage — Required, PARTIAL.** Show measured requests, tokens and latency with explicit coverage. Source: the latest bounded setup call receipts. Failed/rejected usage can be absent; this is not account-wide billing or usage.
- **budgets — Required, PARTIAL.** Show installed paid-spending/external-action guards and token safety ceiling. Sources: explicit setup policy allowlisted fields and usage receipts. Monetary cost, funds and reservations are not inferred. The local accounting view does not prove provider-wide admission.
- **machine — Optional, UNSUPPORTED as Mac telemetry.** The live execution host is Linux. Source: `process.platform` identifies that fact only. Generic CPU, memory, swap, disk and uptime telemetry is not integrated. No unrelated machine-monitoring project is introduced.
- **scheduler — Required for queue readiness.** Source: Uditus task state, stage, dependency and lease fields. Reads work while execution stays paused. An empty queue/readable schema does not establish the claim/heartbeat/expiry/recovery execution path.
- **locks — Future, UNSUPPORTED.** No general workspace/profile/browser resource-ownership producer exists. The existing synchronization lock is not a general lock ledger. No new lock integration is added.
- **integrations — Required for current DB/memory boundaries.** Sources: exact Armis project remote read-back, restricted local operational-memory mirror, recorded memory retrievals, and exact Uditus REST reads. Source details separately explain sender health: no observation, missing access, stale, or unsupported. Email is needed before sending, not for the proposed internal read-only pilot. Commerce is not applicable.
- **schedules — Required for sync visibility.** Source: actual Armis sync observation time and pending outbox count. This proves recent read-back, not systemd state or an invented next-run time. Uditus business scheduling stays paused; scheduler activation is not inferred.
- **approvals — Required.** Sources: Uditus `operations_control`, `batch_approvals`, and bound local environment stop/outbound guards. Kill-switch engagement and explicit outbound-disabled mode are checked separately. Observed controls and approval records are not sending authority.
- **results — Required for recorded outcomes.** Sources: persisted Armis internal outcomes and existing Uditus report-artifact counts. No invented business activity, publication, revenue or delivery claims.
- **deployment — Required.** Source: build stamp loaded from the actual server `dist` directory, plus real database schema/read paths. Normal-service verification additionally compares served asset bytes to disk. Deployment time and migration history are not guessed.
- **incidents — Required, PARTIAL while retained failures lack diagnostics.** Sources: held/rejected setup receipts, recorded cooldowns and sync status. Old unknown outcomes, failure diagnostics and billing remain unknown. No automatic retries or recovery claims.
- **ledger — NOT APPLICABLE.** Aster paper-trading is outside this Armis/Uditus mandate. There is no configured ledger source and no trading activity is created.

## Collection and safety

- The native SSE animation/projection/retry path is retained. Supplemental reports never insert task events, worker attempts, or acceptance state.
- Supplemental `/api/evidence` reads run on Live adapter start and every 15 seconds, with one in flight per adapter and a request timeout. Existing Uditus source reads share one in-flight batch and a 30-second server cache across viewers. The Activity panel continues its existing local evidence reader.
- Every Uditus request is GET with a bounded response, timeout, exact project binding `sgfgoezfazrweaycdlkq`, and server-only credentials. No enqueue, claim, tick, finish, send, scan or model-generation request is made by health collection.
- HTTP 401/403 are missing access; 404 is not configured; unsupported schemas/responses fail closed. Sender-health absence is not sender health. Freshness uses original source timestamps; browser read failures do not re-date evidence.
- Existing role installation is not capacity. Historical successful model receipts are not current availability. Unknown usage and monetary billing are not zero. Operational memories exclude owner profiles, private agent memory, proposed lessons, and lessons not verified.
- Adapter generation guards reject late responses after stop/source switch. Failed supplemental evidence reads cannot disconnect the native SSE or produce decorative motion.
- All business gates are preserved. The viewer is GET-only, authenticated, loopback-bound, and cannot alter controls.

## Smallest proposed Uditus pilot — not started

After separate owner authorization, select **one existing founder-approved scan** and produce an **internal audit-quality/readiness brief from its stored evidence**, followed by independent review. Do not create a client report or outreach draft before lead approval. Do not crawl or contact the site.

External effects would be: a scoped authenticated Uditus database read; bounded authorized model inference for creation/review if delegated; and storing the reviewed internal outcome in Armis. It needs no new website scan, email, publication, trading or paid API enablement. First confirm the actual Uditus worker route, task-family quality and usage/admission controls; configuration timestamps and the prior supplied-text Armis acceptance are not that proof. Current Uditus worker tasks cannot execute while the deliberate kill switch is engaged. Do not clear it as part of visibility work. Sender-health observation and human send review are additional prerequisites only for later outbound work.

## Recovery and deployment

The prior working deployment remains `/home/connor/armis-workshop-integration-20261003` at `4a65f763c57838d8e1f825b68194a748232a44d3`. Protected checkpoint: `~/.hermes/setup/backups/workshop-visibility-20261003/` (runtime/outbox backups and viewer drop-ins). It contains no Git-tracked private files.

The visibility branch is `armis/workshop-operational-visibility-20261003`, in `/home/connor/armis-workshop-visibility-20261003`, stacked on the existing unmerged integration branch. Independent model code review was explicitly waived by the owner after two tool-approval timeouts; neither review attempt executed any calls. This release relies on deterministic tests, real-source inspection, and normal-service verification, not an independent-review or production-qualification claim. Rebuild after committing so the stamp names the exact clean revision. Verify effective systemd directory, `/api/health` revision, and served asset bytes. On failure, restore the checkpoint viewer drop-ins, daemon-reload, restart `armis-viewer`, then verify the old health revision. Database schema and producer services are not changed by this release.
