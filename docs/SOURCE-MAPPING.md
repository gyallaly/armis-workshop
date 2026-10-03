# Source mapping — read-only viewer v1

## Revisions and scope

Viewer baseline: `82520197a211eb93c6259d68ab6ecd08774b86cd` (also actual acquisition HEAD). Dedicated development branch: `armis/live-readonly-viewer`. No local changes existed in the viewer checkout.

Inspected telemetry: `gyallaly/armis-control`, integration checkout HEAD `013b6c561db4457c8f77504f3b5ef9380a437d87`; `src/viewer.ts` last changed at `0bd3d1e1dfcd70d19a9685c027b396a766f10546`. Operational Armis main remains `100537a`. Hermes source revision: `be5e9f72c6681af9dfb75bf480f08844f1499949`. The gateway process points to `/home/connor/.hermes/hermes-agent`. Only the default persistent Hermes profile was listed. An Armis role registry definition is not evidence the role is installed or loaded in that gateway.

Supported upstream Armis contract: `VIEWER_VERSION=1`, sanitized `viewer_events(cursor,event_id,body)` journal. Viewer transport envelope version: 1. The service never imports Store, MandateLedger, an execution host or provider credentials. `LocalViewer.snapshot()` is NOT used: its multi-database snapshot has no atomic consistency guarantee. Instead, source records and the associated cursor are read under one SQLite read transaction and projected together. An additional opt-in Hermes metadata source is described below; the browser never reads Hermes files. The execution host remains owned by the existing separate host/E2E assignment. The integration checkout had advanced to `2d1ce1495c34c33578bfb844d0be2dab6f99264b` when re-inspected on October 2; newer concurrent catalog/worker-factory changes were preserved, not assumed activated.

## Identity

- Persistent worker: upstream `workerId`, exact role registry ID. `armis.ceo` is preserved as the legacy technical ID; display **Managing Director — Hermes**.
- Directors: `armis.operations` → Operations Director; `armis.efficiency` → Efficiency Director; `armis.cfo` → Finance Director; `armis.audit` → Audit Director.
- CEOs: `uditus.ceo` → CEO of Uditus; `aster.ceo` → CEO of Aster Ledger; `etsy.ceo` → CEO of Etsy Business.
- Runtime session: `sessionId`, never substituted for a worker or task. Missing sessions stay unobserved; no generated session IDs.
- Task: `taskId`; multiple attempts do not create multiple workers.
- Execution attempt: `attemptId`, opaque non-secret identifier. Upstream `viewerAttemptId()` hashes a capability token. The capability itself must never be supplied.
- Parent authority: `mandateId`, distinct from task/attempt; `parentMandateId` is separate metadata. Neither identifier proves acceptance or authorization.
- Business: deliberate mapping `armis` → existing `hermes-hq`; `uditus` → `uditus`; `aster` → existing `aster-ledger`; `etsy` → existing `etsy-studio`. The HQ name is **Armis Syndicate HQ**; technical IDs are not casually renamed.

The fixed source registry allows known role IDs, but creates worker entities only for actual journal observations. Defined roles without observations are not drawn as productive workers. Installation state remains **not verified by contract v1**. Source observations are not proof of a persistent profile installation. Appearance is deterministic from the actual role ID and never takes a name or identity from saved Demo preferences.

## Records to viewer state/events

- `task.queued` → `task.created`, fixed sanitized title, queued state; no prompt/criteria contents exported.
- `attempt.started` with all task/worker/attempt/session bindings → assignment/attempt record. Missing bindings do not create invented attempt identities. Admission alone does not animate a worker typing.
- `task.started` → in-progress task only. Does not refresh a worker heartbeat.
- `attempt.activity` → `attempt.action` plus active worker status, with source timestamp and observed provider/model if supplied.
- `attempt.finished` → finished timestamp with **outcome not observed**, unless a future reviewed contract supplies explicit outcome evidence. Model output, exit code and silence never imply success. Worker state becomes unknown, not idle.
- Store `attempt.finished` with `state=held` → held task; reason explicitly says authority-bound completion is missing. With `state=ready`, v1 still lacks required authority/acceptance binding, so the viewer holds it with an explanatory reason rather than emitting `task.ready`.
- `task.held` → held, reason says authority-bound completion is not verified. Private upstream hold text is not exported.
- `task.completed` → recorded result held for acceptance; not sent/published/traded.
- `task.waiting` → provider wait only for explicit provider/capacity reason; otherwise awaiting approval.
- `task.failed` → failed.
- Explicit `worker.idle`/`worker.offline` → respective state; heartbeat loss/source loss → unknown. Bridge heartbeat never touches worker freshness.
- Review and artifact handoff families are present in upstream v1, but do not contain actual from/to stages or approved finding/preview content. They must not generate guessed task handoff dots, fabricated findings or acceptance. This integration currently leaves those animations unsupported. A future upstream contract must persist explicit handoff endpoints and independently accepted authority-bound evidence.
- Mandate/report/control records retain no operational powers. No task mutation API exists. Redirect and controls remain false in all Live states.
- Capacity v1 generic pool values do not identify independent subscription/session/week or Gemini RPM/input-TPM/RPD windows. They cannot honestly populate quota windows; Live capacity remains unobserved until verified window evidence is available. A successful Gemini generation is connectivity only, not remaining allowance or general task quality. Subscription B is not configured until verified.

## Observation limits

Only explicitly instrumented hooks and committed sanitized dispatcher records are observable. Work performed outside them is **unobserved**. This viewer does not see all Hermes activity. The active default Slack profile is not silently claimed to be `armis.ceo`. No business gets invented workers, output, capacity, artifacts or paper positions.

Historical journal reconstruction is a snapshot, not new animation. Reconnect uses a fresh consistent snapshot, not an execution command or replay. Upstream AUTOINCREMENT cursors may legitimately skip integers; transport `previousCursor` establishes the delivered chain instead of assuming cursor+1.

## Explicit native Hermes metadata binding

`server/hermes.ts` opens the active default-profile `state.db` read-only, bound only to session `20261002_162105_235c1110` for this integration. `sessions.id/profile_name/started_at/model` supplies the explicit session, verified default-profile binding and configured/requested model label (not actual provider identity). `messages.id/timestamp/tool_calls` supplies tool request identifiers and names through SQLite JSON projection; `messages.tool_call_id/tool_name/timestamp` supplies returns. Message content, arguments, results and reasoning never enter the browser projection.

- Worker: `hermes.default`, stable installed default profile; Armis role binding **unbound**. It is not `armis.ceo` and other defined directors/CEOs are not fabricated.
- Business: `armis` upstream maps deliberately to `hermes-hq`.
- Task grouping: `dashboard-connection-integration`, explicitly titled **Dashboard connection — integration test** for this operator-authorized bound session. It is not an inferred production mandate.
- Attempt: `tool:` plus a SHA-256 digest of session and opaque call ID; request/return have the same ID. Neither attempt ID is a credential.
- Cursor: durable message ID × 64 + JSON call ordinal; tool return ordinal 63. Invalid ordinals/sequences fail closed. This source imposes a maximum of 63 calls per message; it does not skip records to hide incompatible input.
- `attempt.started`: tool request recorded. `attempt.finished`: tool return recorded, outcome **not observed**. Requested model label is sanitized, actual model/provider/remaining allowance stay unknown. Tool return does not mean accepted result.
- Native task acceptance, mandate, independent reviewer role, worker handoffs and business result: not exposed by this metadata contract and therefore unobserved. No `task.ready` is emitted.

Only request/activity evidence updates the worker. Transport heartbeat never does. Outside this bound session—including other live host assignments and delegation internals—work is unobserved. The service starts neither a host nor a worker. This narrow source permits seeing the actual assistant's tool activity without activating business workflows.
