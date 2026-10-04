# City V2 installed readiness and activation inventory

Status: internal development tooling, not business authorization. The observed Linux user service `armis-viewer.service` remains active from `/home/connor/armis-workshop-visibility-20261003`. No live activation or rollback was executed by this task. The installed Hermes checkout is read-only. Parent owns deployment and commits.

## Owned tooling

- `scripts/city-v2-readiness.mjs`: credential-free installed HTTP/SSE observation, exact source/build fingerprints and explicit local verification runner.
- `scripts/city-v2-deploy.mjs`: plan-only by default; bounded Linux user-service switch and rollback, requiring explicit apply and exact passing verification receipt.
- `scripts/city-v2-readiness.test.mjs`: isolated fixture and transaction tests, not installed executor evidence.
- `scripts/city-v2-readiness-e2e.mjs`: standalone candidate E2E runner for diagnosing a failed full verification without attaching to the operational viewer.

No package scripts, existing service files, owner policy, business workers or other workers' source files are changed by these additions. No dependency installation, Git fetch/reset/checkout/commit/push, provider/model changes or paid fallbacks are performed by this tooling.

## Parent workflow (not executed deployment)

From `/home/connor/armis-workshop-city-v2`, run:

    node scripts/city-v2-readiness.mjs --verify --output /absolute/private/path/new-receipt.json
    node scripts/city-v2-deploy.mjs --root /home/connor/armis-workshop-city-v2

The verifier executes typecheck, domain tests, every `scripts/*.test.mjs` test, build and candidate E2E. It creates the Playwright configuration and test output under external `TMPDIR`, outside Git. The candidate is served by Vite preview from this checkout's absolute `dist` on a newly selected loopback port, not 4173, with `--strictPort` and `reuseExistingServer:false`. It does not reuse or restart the operational service. The existing Playwright test cases remain unchanged. Chromium is the local default; `PW_CHANNEL` may select an already installed browser. No browser installation is attempted. A missing browser or failed test produces a failed receipt, never a fabricated success. A port race fails closed rather than attaching to another server.

The receipt binds exact content hashes of candidate source (including untracked code), built assets, Git revision and all five successful suites. Source changes during verification invalidate the result. The build stamp identifies revision/branch/dirty status/time; revision alone does not identify dirty source. A passing receipt is local test evidence, not complete installed business readiness. It expires after 24 hours and becomes invalid whenever source/build changes.

Only after all parent review/integration and tests pass, the parent may invoke:

    node scripts/city-v2-deploy.mjs --apply --root /home/connor/armis-workshop-city-v2 --receipt /absolute/private/path/new-receipt.json --expected-revision EXACT_RECEIPT_REVISION --expected-source-hash EXACT_RECEIPT_SOURCE_HASH --expected-build-hash EXACT_RECEIPT_BUILD_HASH

Those placeholders must come from the real receipt; do not hand-write a receipt. Installation writes only `zz-city-v2-switch.conf` in the existing user service's drop-in directory. It uses the already installed Node executable, absolute candidate CLI/dist paths and an absolute original policy path. Existing unit/drop-ins, source database bindings, owner policy and private chat storage are retained, not reset. Policy storage is never copied into Git. Unrelated dirty source is preserved; an exact fingerprint replaces a dangerous clean-tree/reset requirement.

A private checkpoint and result live in `~/.local/state/armis-city-v2`, mode 600; a directory lock serializes switches. Existing configuration fingerprints must remain unchanged. Unsupported service bindings, symbolic config files, later overriding drop-ins, relative source bindings or EnvironmentFile-based policy anchoring are refused for explicit reconciliation. The deployment script does not apply database migrations; parent must independently establish schema compatibility using real producer/read paths before activation.

Before switching, the previous viewer must pass authenticated readiness against its stamped revision. After switching, actual service working directory/command and authenticated candidate revision/SSE are checked. A failed candidate restores only this tooling's drop-in, reloads/restarts the viewer, and checks the prior binding/revision/health. Modified external configuration prevents destructive rollback. Failed recovery is `rollback-unverified`, never success. Repeated already-active switches verify health without restarting or creating another checkpoint. Checkpoints retain paths/hashes and this tool's prior drop-in, not environment values, cookies, private transcripts or credentials.

Parent-only explicit recovery:

    node scripts/city-v2-deploy.mjs --apply --rollback /home/connor/.local/state/armis-city-v2/checkpoint-ACTUAL_ID.json

Unknown activation or recovery outcomes must be reconciled before any replay. A stale lock after an interrupted operation is intentionally held for manual parent inspection, not automatically cleared.

## Authenticated installed observations

    node scripts/city-v2-readiness.mjs --origin http://127.0.0.1:4173 --expected-revision EXACT_RUNNING_REVISION --output /absolute/private/path/new-installed-report.json

The checker uses legitimate navigation headers to acquire an HttpOnly/SameSite navigation cookie. Anonymous API access must return 401 and a foreign Origin must return 403. Cookies are kept only in memory and never printed or persisted. The checker reads health, control, evidence and one bounded named SSE stream, requiring a live snapshot and coherent heartbeat/cursors. Current-work frames are accepted without projecting them into fabricated activity. All requests are GET; no chat/provider request, control command, admission, release or generation is sent. Deployment startup retries are bounded transport reads, not polling for business generation.

`transportReady`/`viewerReady` do not imply `businessReady`. This observer always reports business readiness false. Chat-only advertised availability is separately `advertised-unexercised`; supported chat transport is not proof of executive/worker/delegation/schedule/provider/tool coverage. Global company/allocation controls advertised enabled are held by this activation checker until separate installed acceptance is available. This tool neither changes capability configuration nor claims to establish executor coverage. Uditus execution and sending remain paused by authorization; the report is not a verified measurement of every external kill switch.

Source inventory includes all 23 categories: runtime, organization, workers, sessions, jobs, progress, handoffs, tools, quality, artifacts, capacity, usage, budgets, machine, scheduler, locks, integrations, schedules, approvals, results, deployment, incidents and ledger. Missing reports remain unobserved; old reports become stale after 45 seconds. Empty successfully observed sources can legitimately have zero records. Only IDs, states, counts and timestamps are retained; arbitrary source detail strings, private event bodies and conversations are not copied into reports.

Gate inventory imports the exact frozen `EXECUTION_PATHS` exported by `server/owner-policy.mjs`: owner-chat, main-chat, auxiliary-models, executives, workers, delegations, schedules, retries, provider-adapters and tool-processes. All ten remain independently unverified. A bridge advertisement or successful GET cannot mark them verified.

## Exact release acceptance inventory

These eleven rows correspond in order to `docs/CITY-V2-SPEC.md` release acceptance. The machine report retains every row as unverified until real scenario evidence is supplied; a broad test-suite pass cannot silently promote installed coverage.

| ID | Acceptance obligation | Evidence available from this tooling | Remaining installed gap |
|---|---|---|---|
| semantic-replay | Identical observations produce identical semantic state independent of frame rate. | Candidate domain test execution recorded by verifier. | Explicit semantic replay scenario evidence and visual/frame-rate exercise. |
| source-loss | Source loss never creates fake lounge occupancy, full reactors or confirmed stopped status. | Boundary/SSE malformed and missing snapshot tests; candidate domain/E2E suite execution. | Installed source-loss scenario and visual verification. |
| command-idempotence | Duplicate commands are idempotent; conflicting revisions cannot overwrite newer policy. | Verifier targets existing owner-policy runtime fixtures; this run stopped before that suite. | Installed deterministic command receipts and conflicts. |
| atomic-reservations | Concurrent siblings cannot over-reserve company/provider budgets. | Verifier targets existing owner-policy fixtures; this run stopped before that suite. | All installed provider adapters and siblings independently intercepted. |
| company-shutdown | Shutdown fences attempts, nested calls, schedules/retries, reconciles cancellation/residual usage and isolates companies. | Transaction rollback tests and existing policy fixtures. | Real installed cancellation and residual reconciliation, all paths covered. |
| restart-durability | Restart preserves limits, stopped state, commands/outcomes; disconnect does not release holds. | Existing restart policy fixtures; checkpoint restoration fixtures. | Installed restart/cancellation/reservation acceptance; browser disconnect proof. |
| installed-gates | Every request path is listed/checked; unsupported controls remain disabled precisely. | Shared ten-path unverified inventory, capability separation and control activation hold. | Independent per-path installed interception checks. |
| quota-evidence | Unknown/stale totals, multiple windows/resets, exhaustion/fallback and shared-pool accounting. | Candidate domain tests; no fabricated allowance. | Provider-reported entitlement/window collectors and per-scenario evidence. |
| chat-integrity | Duplicate sends, interruption/reconnect, recipient identity, cancellation and truthful action receipts. | Runtime tests are a verifier target; advertised-unexercised chat-only state. No live chat was executed. | Supported installed chat scenario proof without inferring global coverage. |
| deployment-rollback | Build/domain and installed config/schema/service/protocol/source/control checks support rollback. | Exact verification receipt; isolated candidate E2E; fixture-tested checkpoint/switch/rollback; read-only installed checker. | Parent live activation, verified rollback exercise and independent schema compatibility. |
| visual-accessibility | Geometry/occlusion/camera/minimap/interiors, labels/controls/keyboard/reduced motion at required viewports. | Existing candidate E2E cases run on isolated preview; test results recorded honestly. | Full named visual acceptance, not implied by partial existing E2E coverage. |

No business campaign, scan, sending, trading, worker spawning or paid provider call is needed or authorized to populate these reports. Healthy transport, quiet evidence and partial source coverage are useful observations, not production qualification.

## Actual task verification results

- `node --test scripts/city-v2-readiness.test.mjs`: 19 passed, zero failed, run twice.
- `node --check scripts/city-v2-readiness.mjs` and `node --check scripts/city-v2-deploy.mjs`: passed at the initial test checkpoint.
- Full verifier: typecheck passed; domain suite failed; runtime/build/E2E stages were not reached. The real failed receipt is `/home/connor/.hermes/cache/scratch/city-v2-readiness-verification-20261003.json`. It is not an activation receipt and subsequent source edits invalidate its fingerprints.
- Separate `npm test`: 123 passed, 4 failed, 1 skipped. Failures were 5000ms timeouts in current-work, runtime-evidence, operational-connections and visibility-sessions tests. Those files belong to other workers and were not edited by this task.
- Standalone candidate E2E ran on `http://127.0.0.1:38461` and returned failed. Temporary configuration: `/home/connor/.hermes/cache/scratch/city-v2-readiness-MWYKc6/playwright.config.mjs`. Private execution log: `/home/connor/.hermes/cache/scratch/city-v2-readiness-MWYKc6/execution.log`. The detailed E2E failure cause was not reviewed within this task's time limit; no passing E2E receipt is claimed.
- `node scripts/city-v2-deploy.mjs`: returned plan-only against the actual previous visibility checkout; configuration/policy storage preservation prerequisites passed. No `--apply`, deployment, restart or rollback was executed.

Parent must resolve the domain/E2E failures, review remaining installed gaps and run a fresh full verifier after integration before considering activation. No complete release or business readiness is claimed.

## Internal protection fix and parent integration contract

`checkReadiness` now accepts `expectedSourceHash` and `expectedBuildHash`, alongside `expectedRevision`; CLI equivalents are `--expected-source-hash` and `--expected-build-hash`. Parent-owned health must expose `build.sourceHash` and `build.buildHash` as startup SHA-256 fingerprints (64 lowercase hexadecimal characters), using the same source/build `treeHash` inventory. Expected fingerprints missing from health, malformed or unequal fail closed. Unbound observational reports retain missing hashes as null, not proof of exact identity.

Deployment captures a full previous identity and requires exact candidate and recovery fingerprints. It recomputes `buildIdentity(root)` after baseline health/checkpoint immediately before installation, again before restart, and after candidate health. Identity changes refuse activation or trigger rollback. Already-active health is also followed by revalidation. Older viewers lacking startup fingerprints are a genuine recovery prerequisite blocker, not a revision-only fallback.

Durable chat passes measured tokens into policy release and keeps unknown monetary cost null. Known consumed counters are lower bounds when `unknownTokens`, `unknownRequests` or `unknownCost` is true; finite ceilings cannot be enforced from those lower bounds. A completed owner dispatch counts at least one request without asserting a known nested request total. Unknown or invalid execution and cancellation retain durable reservations and prohibit replay.

Finite chat token/request/spend ceilings require an installed transport's enforced admission contract covering the entire resumed turn, nested calls and retries. The optional transport `admission(request, sessionId)` returns `{enforced:true,provider,tokens,costMicros,requests}` with safe nonnegative integer bounds or null for unknown. The transport must actually enforce these values; an estimate, advertisement or output-token flag is insufficient. Missing bounds hold before dispatch; invalid or exceeding measured receipts leave the outcome unknown and retain the reservation. No CLI bound implementation or paid billing assumption is supplied here.

Production CLI still lacks an independent installed per-path verifier; chat remains held. Fixture verification never enables it. No installed Hermes, configuration, service, business execution, spending or credential mutation was performed. This fix used failing regression tests first; original task verification results above are historical and not a new release receipt.

## Parent acceptance checkpoint — October 3, 2026

- Real standalone Hermes workers produced source edits and tests; the five-worker batch was followed by disjoint UI, independent review and correction assignments, with no more than five workers concurrent.
- Parent domain run: `npm test -- --maxWorkers=2 --testTimeout=60000` returned 144 passed, one skipped. Parent runtime run: `node --test scripts/*.test.mjs` returned 63 passed, zero failed. Typecheck passed. After increasing bounded verification time budgets, the focused readiness/startup suite returned 23 passed.
- Actual authenticated candidate on port 4185 connected to the existing runtime journal, exact configured Uditus read-only binding and explicitly allowlisted native sessions. The readiness probe returned viewerReady true and 23 diagnostic categories. This is observer connectivity, not release acceptance.
- Actual browser verification rendered 11 native session records, including the original five implementation sessions, with no page errors. These are historical and current explicitly scoped sessions, not 11 concurrent workers or additional declared roles. Configured models remained labeled separately from actual model receipts, which were not reported.
- The empty jagged rock is separate from the campus and visually clear of the collapsed chat overlay. Its overlay-clearance correction was committed and read back on GitHub as `85f410459f307dfccd260c735c2207d7628c722d` on `armis/city-v2-installed-20261003`. The rest of the integration remains local and uncommitted.
- Independent isolated Chrome suite on port 38753: seven passed, three failed, fourteen did not run at its 300-second suite deadline. Two zoom/label cases exhausted interaction budgets at Hermes HQ; the cutaway transition case sampled progress 1 instead of below 1. No assertions were weakened. Artifacts: `/home/connor/.hermes/cache/scratch/city-browser-qa-h1hWkt/`.
- Deployment discovery refused the recovery build: its old stamp contains revision/branch only, without the newer build identity fields or startup fingerprints. The active viewer stays in `/home/connor/armis-workshop-visibility-20261003`; no activation, restart or rollback of that service occurred.
- Real live chat, full owner-control enforcement, provider entitlements, complete browser acceptance and verified service recovery remain blockers. Business execution, database/environment kill switches and outbound sending remain paused; no production qualification or complete integration is claimed.
