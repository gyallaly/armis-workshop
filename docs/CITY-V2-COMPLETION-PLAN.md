# Workshop and Armis agent integration — completion plan

Status: proposed execution plan, grounded in the October 3, 2026 local checkpoint. Writing this plan does not authorize business activation, sending, trading, publication or paid spending. No workers or business schedulers are started by this document.

## Definition of complete

The installed Managing Director can receive an authenticated Workshop request, translate it into a bounded authorized mandate, dispatch eligible workers through a durable controller, inspect real tool execution and artifacts, obtain independent review, and report the outcome with verifiable receipts. Workshop shows the actual director and workers, their tasks, blockers, usage and policy state. Stops, budgets, isolation and recovery work at runtime rather than only in prompts. The intended normal service runs the reviewed build and survives tested restart/recovery.

Agent-framework readiness, a business adapter's readiness, and permission to operate that business are separate gates. Uditus execution/sending remains paused until separately authorized. Aster trading and Etsy publication are outside the current execution mandate; they must remain explicitly unconfigured/paused unless their adapter requirements and authorization are separately established. Unsupported optional telemetry may remain honestly unavailable; required execution controls may not.

## Verified starting point, not a new release receipt

- Active normal viewer: /home/connor/armis-workshop-visibility-20261003. Armis database synchronization service is active.
- City V2 candidate: /home/connor/armis-workshop-city-v2. Observer connectivity and browser rendering of explicitly scoped native sessions were verified.
- Most integration code is local and uncommitted. Island changes are published on armis/city-v2-installed-20261003 at 85f410459f307dfccd260c735c2207d7628c722d.
- Last combined checks: 144 domain tests passed, one skipped; 63 runtime/readiness tests passed; typecheck/build passed. These must be repeated against the final immutable release.
- Browser QA: seven passed, three failed, fourteen not run. Two label/zoom interaction timeouts and one cutaway transition assertion remain unresolved.
- Production CLI has no independently verified installed execution-control binding. Live chat and full company controls remain disabled.
- Recovery viewer's legacy stamp lacks the new complete build identity/startup fingerprints. Current deployment tooling refuses it.
- Read-only Uditus workshop status returned an empty task list. This is not evidence that a real create/review/repair lifecycle works.

## Phase 1 — Reconcile targets, scope and recovery (first prerequisite)

1. Inventory exact viewer, Control, runtime/dispatcher and Uditus revisions, dirty work, open integration branches and service bindings. Preserve unrelated edits; distinguish published, candidate and running code.
2. Enumerate every intended installed role and process: purpose, authority, parent, profile/instruction binding, permitted tools, business scope, provider route, lifecycle owner and readiness status. Declared organization membership is not proof of installation or execution.
3. Identify the supported installed Hermes seams from live source and official documentation. Do not assume lifecycle callbacks can enforce cancellation or admission.
4. Checkpoint scoped source/configuration, service units, private policy and consistent databases outside Git, with a recovery procedure.
5. Establish a verifiable recovery release compatible with the new identity contract, using an isolated preparation and explicit recovery validation. Do not fabricate old stamp fields or weaken exact-identity checks.

Exit gate: approved target/process inventory, preserved work, and an actually exercisable recovery path before any normal-service switch.

## Phase 2 — Implement the installed execution/control bridge (critical path)

1. Define a versioned authenticated bridge connecting Workshop policy to the actual controller and Hermes executor; define independent verification evidence and service bindings. No blanket verified callback.
2. Intercept all ten required paths: owner-chat, main-chat, auxiliary-models, executives, workers, delegations, schedules, retries, provider-adapters and tool-processes.
3. Require trusted business/mandate/session attribution before admission. Unmapped managed execution is held and reported. Inventory pre-existing unmanaged processes rather than pretending the bridge controls them.
4. Enforce admission before inference, retries, nested work and tools. Recheck revocation at completion; protect result persistence with the actual authority/lease transaction where supported. Preserve held fallback where cross-database atomicity is not established.
5. Fence immediately on stop, cancel owned processes/schedules/retries through supported handles, and reconcile provider residual usage. Show stopping/unknown until termination and effects are confirmed.
6. Preserve the separate owner-services reserve. Company shutdown isolates that company; global AI stop covers owner inference as well while the non-AI status/control interface remains reachable.

Exit gate: independent installed deny/allow/revoke/stop tests for every path, including attempts through nested calls and restarts. Unsupported paths cannot be enabled through UI, prompt or fixture evidence.

## Phase 3 — Make the agent lifecycle durable and bounded

1. Connect Managing Director -> dispatcher -> creator -> independent reviewer -> bounded repair -> acceptance, with explicit briefs and criterion evidence.
2. Persist stable job/attempt/session/process/command/artifact IDs, dependencies, revisions, leases, heartbeats, cancellation, retry counters and outcome state.
3. Verify single-writer assumptions or implement supported cross-process arbitration; process-local locks alone are not a multi-worker guarantee. Use atomic claim/reservation/completion transitions.
4. Retain unknown-outcome holds until actual process, provider and external effects are reconciled. Never blindly replay interrupted work.
5. Enforce resource ownership for checkout, browser/profile and other shared resources before concurrent use. Use separate workspaces where required; restrict worker tools and secrets to their mandate. Prompt constraints are not an OS sandbox.
6. Keep Uditus serialized and preserve existing runtime limits. Up to five development workers is an owner ceiling, not permission to raise business concurrency.
7. Restore and test independent review with a distinct identity and fresh session, actual artifacts, exact criterion coverage and bounded correction cycles. Creator prose alone is not verification.

Exit gate: real bounded internal create/review/repair lifecycle, dependency sequencing, sibling contention, crash/expiry recovery and no duplicate completion/effect; every artifact can be read back and checked.

## Phase 4 — Verify routing, usage and enforceable budgets

1. Register exact approved provider/account/project/access-channel/model routes. Separate configured models from actual execution receipts and tested task-family suitability.
2. Use one shared quota-pool identity where accounts/routes share limits; enforce concurrency and request/token/time/spend reservations across siblings and retries.
3. Require transport-enforced whole-turn upper bounds for finite ceilings. Output-token settings alone do not bound nested inference or tool activity.
4. Reconcile measured requests/tokens/costs with provenance. Missing cost or provider limits remain unknown, not zero or full capacity. Unknown residual usage retains holds.
5. Collect subscription/API entitlement and reset evidence only through supported sources. Where unavailable, disclose that limitation and rely only on supported conservative local controls; do not invent reset windows or enable paid fallback.
6. Test exhausted limits, multiple windows, route denial, provider failure and permitted fallback without paid spending or automatic credential rotation.

Exit gate: independently tested hard local controls, actual route/usage receipts and truthful scope/freshness. Provider-wide quota knowledge is not claimed where unsupported.

## Phase 5 — Complete truthful Workshop telemetry

1. Bind the actual current Managing Director across the authorized TUI/CLI/Slack surfaces; do not present only an older Slack conversation as current work.
2. Replace temporary scratch allowlists with durable, trusted session enrollment from the dispatcher. Explicit authorization/privacy boundaries remain; never scan all private sessions for animation.
3. Link each authorized mandate/job/attempt/session/process/artifact/review and command to its real lifecycle events. Show current work, stale history, waiting, held, cancelled and unknown separately.
4. Consume verified actual model/provider receipts where available; keep configured routes explicitly labeled otherwise. Session closure does not establish independent acceptance.
5. Maintain epoch/cursor consistency, reconnect, deduplication, backpressure, source-loss behavior and bounded authenticated evidence polling.
6. Reconcile all 23 diagnostic categories against actual producers. Required execution feeds need genuine end-to-end proof; optional/unconfigured feeds need explicit source, reason, scope and freshness, not artificial green status.
7. Verify restricted operational-memory retrieval, synchronized outcome/artifact read-back, sync failure/outbox recovery and absence of private prompts, secrets or reasoning in telemetry. Align stale documentation with tested behavior.

Exit gate: a bounded internal task is observable from launch through review and final artifact; disconnect/reconnect and quiet periods remain truthful, with no fabricated identities or progress.

## Phase 6 — Enable real authenticated Workshop conversations

Depends on phases 2–4; UI transport availability alone is insufficient.

1. Bind the intended recipient/profile and identify it accurately in the UI; distinguish the technical session from the Managing Director role.
2. Exercise authenticated send, reply, supported streaming, reconnect, resume, duplicate/conflicting IDs, cancellation and unknown outcomes with a bounded internal request.
3. Resolve selected company/job/agent context through stable authorized references, not arbitrary private data.
4. Route chat-triggered work through the same mandate, command, approval and budget gates; link actual command receipts and effects to the reply.
5. Test same-origin/authentication boundaries, durable storage ownership, retention and browser disconnection. No model call is used just to generate health indicators.

Exit gate: real safe owner conversation and authorized internal task succeed; stopped, denied, duplicate and interrupted requests cannot bypass policy or replay work.

## Phase 7 — Establish business-adapter readiness without activation

1. Reverify repository/database bindings for every connection. Uditus target is sgfgoezfazrweaycdlkq; do not inspect unrelated projects.
2. Verify migration/schema prerequisites, indexes, RLS/grants and real producer/read paths, not merely table existence. Add versioned migrations only when needed; never edit applied migrations.
3. Test Uditus queue/claim/heartbeat/lease/expiry/create/review/repair and artifact retention against isolated fixtures or a separately authorized internal pilot. Never clear production kill switches to obtain smoke-test activity.
4. Preserve suppression/unsubscribe/compliance, founder lead approval, human send review and signed scan authorization. Validate negative paths as well as successful paths.
5. Keep sender health and external-action readiness distinct from internal assessment readiness. Sending, customer activity, real scans, trading and publication require their own authorization and prerequisites.
6. Produce a per-business supported/not-configured/blocked matrix. Any separately requested new business adapter needs a bounded follow-up mandate, not invented readiness.

Exit gate: the supported business adapter's internal path and safeguards are verified; activation remains explicitly separate and paused.

## Phase 8 — Resolve browser/performance/accessibility acceptance

Can begin alongside phases 2–5, but final verification waits for frozen source.

1. Reproduce the two Hermes HQ zoom/label interaction failures and cutaway transition failure on an isolated candidate with an installed browser.
2. Diagnose render responsiveness, cumulative test cost and animation observation timing. Repair source defects or inaccurate sampling at the correct layer; do not remove assertions or substitute a larger wrapper budget for a fix.
3. Run all browser cases to completion, including campus/business/worker navigation, controls, keyboard, reduced motion, source switching/loss/reconnect, relevant viewports, minimap, geometry, labels and island/chat-overlay clearance.
4. Check auth/privacy controls, visible freshness and capability-disabled explanations. Verify no page errors and bounded rendering/polling.

Exit gate: the full browser suite and named visual/accessibility checks pass on the exact intended candidate, not the older service on port 4173.

## Phase 9 — Independent release review, publication and deployment

Depends on all required implementation and test gates.

1. Freeze worker edits and review the exact integrated diff, including pre-existing dirty work ownership. Keep secrets/private state/backups out of Git.
2. Run typecheck, complete domain/runtime/database/browser suites and all eleven City V2 acceptance scenarios: semantic replay; source loss; command idempotence; atomic reservations; company shutdown; restart durability; installed gates; quota evidence; chat integrity; deployment/rollback; visual accessibility.
3. Record exact source/build/runtime revisions and hashes, scenario evidence, exceptions and independently verified path coverage. Resolve consequential independent-review findings.
4. Commit/push the authorized reviewed integration scope, read back the remote revision and inspect CI. Publication alone is not installation.
5. Produce a fresh exact-source/build passing release receipt. Check service/source/config/schema compatibility and the verified recovery baseline immediately before activation.
6. Switch only the intended normal user service, preserve unrelated sources/configuration, and read back actual process/service binding, served fingerprints, authenticated SSE, producer connections and enabled capabilities.
7. Exercise bounded restart and rollback, including failure recovery. Reverify the final desired deployment afterward. Unknown recovery outcomes block replay.
8. Put durable service configuration, recovery instructions and readiness reports outside scratch. Provide startup/logout/reboot behavior appropriate to the real Linux host and desktop dependency; do not assume Mac hardware or session-independent browser access.

Exit gate: reviewed published source, successful CI where configured, installed exact build, independently verified controls, restart/recovery receipts and no uncontrolled duplicate scheduler/process.

## Phase 10 — Final installed system acceptance

Run through the real normal Workshop, not a fixture or development-only API:

- Owner request -> correct Managing Director -> bounded mandate -> eligible worker -> observed tools -> durable artifact -> independent review -> truthful final outcome.
- Deliberately failed assignment -> bounded repair or retained hold, never false success.
- Duplicate submission -> one execution/effect.
- Dependency/lease conflict -> safe waiting or fencing.
- Stop during inference/tool/nested/scheduled work -> immediate admission fence and truthful cancellation/residual reconciliation.
- Restart/browser disconnect/source loss -> retained policy/reservations, reconnect-safe evidence and no blind replay.
- Exhausted allocation/route/provider -> held work with a concrete explanation and no paid fallback.
- Uditus remains stopped/outbound-disabled throughout internal setup tests.

The final report lists each required role/process/adapter as verified, blocked or unsupported with its evidence and remaining scope. Only the supported verified set may be called operational. Framework completion does not imply every declared future business is implemented or authorized.

## Parallel execution and ownership

Use no more than five active development workers. Wave one can split into: installed enforcement bridge; durable dispatch/review/resource ownership; telemetry/identity/memory; browser/performance; independent read-only review. Assign disjoint files and one parent owner for shared contracts. Do not let the reviewer implement the code it accepts. Follow-up routing/chat/business-adapter tasks start only after dependent contracts stabilize.

The Managing Director owns scope, cross-repository reconciliation, private checkpoints, acceptance decisions, commits, service switches and final read-back verification. Do not broaden worker tools, routes, spending or runtime limits merely to remove a blocker. If a required supported enforcement seam or credential is absent, report the exact gap and revise the bounded task rather than enabling a pretend capability.

## Final go/no-go checklist

- [ ] Target/role/process inventory and recovery baseline verified.
- [ ] All ten installed execution paths independently enforced.
- [ ] Durable dispatch, independent review, locks/leases and unknown-outcome recovery proven.
- [ ] Approved routes and enforceable shared usage/admission bounds proven.
- [ ] Current director and worker telemetry accurately connected across authorized surfaces.
- [ ] Real authenticated chat and linked operations pass installed tests.
- [ ] Supported Uditus internal adapter paths and protections verified, still paused.
- [ ] Full browser/accessibility and all eleven release scenarios pass.
- [ ] Reviewed source published; exact build installed; restart/rollback verified.
- [ ] Final real installed internal workflow passes with durable evidence.
- [ ] Business activation/send/publication/trading decisions remain separate from setup acceptance.
