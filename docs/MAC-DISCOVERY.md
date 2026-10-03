# Mac mini discovery, 2026-10-03

Evidence: owner-supplied read-only terminal report. These are installation and schema observations, not verified live telemetry or remote access.

- Linux x86_64; Python 3.14.4; Node 22.22.1.
- Hermes executable: `/home/connor/.local/bin/hermes`. Installed Hermes revision remains unverified.
- Control: `/home/connor/armis-control`, main at `100537aac66c4f597ace5d24b2da8155b6a14f9c`, clean.
- Uditus: `/home/connor/uditus`, `codex/workshop-delegation` at `566fecddccc349bb3e1ff0fce69b79a14291b5b6`, three local changes.
- Workshop: `/home/connor/armis-workshop`, `armis/mac-workshop-update` at `8d538d34af595d02c2e199e3eea3867b014a0593`, eleven local changes. Inspect and preserve these before update/deployment.
- Port 4173 listens on Mac loopback. Its process, routes and telemetry capabilities remain unverified.
- System service inventory found no named ARMIS/Hermes services; user services were not included in the first probe. This does not prove services are absent.

## Observed candidate sources

`~/.hermes/state.db`: sessions include profile identity, parent session, activity time/provenance, model/provider, calls, tool counts, token categories, estimated/actual cost and cost provenance. `session_model_usage` provides per-model usage. Gateway heartbeats include process/profile and heartbeat times. Async delegations include lifecycle times and states. Do not read message bodies, prompts, reasoning, auth files or raw delegation payloads for this discovery.

`~/.hermes/kanban.db`: tasks include assignment, lifecycle, priority, lease/heartbeat, session/run IDs, blocking and workflow fields. Task runs include profile, stage, status, lease/heartbeat and outcome. Links/events can supply hierarchy and history once semantics are verified.

`~/.hermes/projects.db`: projects and folder mappings exist. Not yet mapped to city businesses.

`~/.hermes/shared-state.db`: hosted rooms, links, runs and policy events exist. Their presence is not evidence that any member is executing.

`~/.hermes/setup/runtime/runtime.db`: workflows, calls, cooldown, viewer_events and memory_retrievals exist. Calls have role/model/state/reservedTokens/receipt fields. A separate update backup also contains runtime tables; never treat backup rows as current execution.

`~/.hermes/setup/armis-db/outbox.db`: records include kind, source, provenance, digest and synced_digest. Destination and active synchronization remain unverified.

## Required next verification

Owner workflow: build/test on the PC, deliver through GitHub, and have the Mac updater execute deployment and automated checks. Do not require further manual terminal diagnostics. `npm run check:mac` performs a read-only HTTP authentication, source health, authoritative snapshot, cursor continuity and quiet heartbeat check of the existing loopback viewer. It writes a credential-free `.armis/connection-readiness.json` for deployment automation. This check establishes transport readiness, not correctness of every underlying business feed. Unit protocol fixtures are not real Mac evidence.

Check user-service status, installed executable target/revision, repository change filenames and telemetry-related tracked files. Read aggregate counts and recent non-content lifecycle timestamps from current databases. Inspect viewer event envelope keys/types without emitting payloads. Identify the running viewer/bridge and actual routes from its code before connecting. Bind profiles/roles to canonical city IDs explicitly. Never infer active agents from open session rows or database WAL file presence.

## Second owner report

User services `armis-viewer.service` and `hermes-gateway.service` report active/running. Hermes has 49 sessions, all labeled default; 28 have no end timestamp, which does not establish that they are running. Latest activity is approximately 23 seconds before collection. Gateway heartbeat table and Kanban tasks/runs return no rows. Runtime contains four completed and three held workflows; recorded calls have completed/held states, not active states. Viewer journal has 244 events. Outbox rows have matching sync digests, but this alone does not establish remote database availability.

The Mac's event envelope uses eventId/occurredAt/data and includes mode/source/provenance, rather than this checkout's id/sourceTs/payload contract. Mac runtime role labels include armis.auditor and armis.operator; their canonical mapping requires verification. Separate default-profile Hermes sessions must not be multiplied into declared city agents.

Fetched remote `armis/mac-workshop-update` at `44e9884cc8519b8c8c381dbcc583865678f0e441` for code inspection only. The initially reported older commit does not contain the listed server files, so get current running/build revisions before deployment. Remote server code exposes loopback authenticated GET `/api/health`, `/api/events`, `/api/evidence`; SSE uses named snapshot/events/heartbeat frames and observations, not the local onmessage protocol. Bootstrap cookies require a document navigation. Mac has additional uncommitted server/current-work changes which are not included in the fetched remote. Do not merge or replace that checkout until those changes are reviewed/preserved.
