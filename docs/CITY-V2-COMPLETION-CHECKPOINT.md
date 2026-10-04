# Completion checkpoint — October 3, 2026

## Exact targets

- Workshop candidate: `/home/connor/armis-workshop-city-v2`, branch `armis/city-v2-installed-20261003`, HEAD `85f410459f307dfccd260c735c2207d7628c722d`; integration changes remain dirty/untracked.
- Control: `/home/connor/armis-control-integration`, branch `armis/multimodel-workers`, HEAD `e0dc8df8e21d0b5352ea0da51ad47258d997d4e2`; existing persistence edits preserved.
- Uditus: `/home/connor/uditus`, HEAD `566fecddccc349bb3e1ff0fce69b79a14291b5b6`; existing CLAUDE.md/local setup preserved.
- Installed Hermes: `/home/connor/.hermes/hermes-agent`, HEAD `be5e9f72c6681af9dfb75bf480f08844f1499949`; clean at inventory, read-only during this worker wave.
- Active normal viewer: `/home/connor/armis-workshop-visibility-20261003`, HEAD `206ff37e8382b5b50dcc4a29209554fb39ac972f`; active `armis-viewer.service`. No service switch performed.
- `armis-db-sync.service` active, bound to Control checkout. No business scheduler started.

## Recovery checkpoint

Private source/status/revision/binary diffs, selected untracked source, service units, default config, setup policy and consistent SQLite backups reside at `/home/connor/.hermes/setup/backups/completion-20261003-204730`. Both default `state.db` and actual `setup/runtime/runtime.db` passed SQLite quick_check after backup. No private data or backups are included in Git. This checkpoint is not yet an exercised exact-build recovery release; compatible recovery verification remains required.

## Independent internal verification

Command: `node --import tsx --test --experimental-test-module-mocks packages/core/workshop.test.ts packages/core/workshop-db.test.ts`.
Result: 8 passed, 0 failed, 0 skipped. Tests cover migration idempotency, RLS/privileges, stop/leases/dependencies, bounded repairs, strict review coverage, literal stdin transport, interruption and routing bounds in isolated PGlite/subprocess fixtures. Log: `/home/connor/.hermes/cache/scratch/completion-uditus-internal-tests.log`.

Actual intended Uditus REST target reverified: `sgfgoezfazrweaycdlkq`. Read-only `operations_control` returned `kill_switch: true`; repository local flags returned `UDITUS_KILL_SWITCH=true`, `UDITUS_OUTBOUND_ENABLED=false`; actual workshop task read-back returned empty. No production task was enqueued or switch cleared. Passing internal fixtures does not establish production business execution readiness.

Setup runtime read-only state inventory: 16 completed/3 held workflows; 47 completed/2 held/2 rejected provider calls. These are historic observations, not new acceptance receipts. Held outcomes were not replayed.

## Worker ownership

Current bounded development wave uses existing OpenAI Codex OAuth route through standalone Hermes (not absent Codex CLI). Configured/requested model is gpt-6.1-sol; actual served identity must come from terminal receipts, not this declaration.

- Enforcement investigation: process `proc_22d253f41ad1`, session `20261003_204928_cdc34c`; read-only runtime/Control path audit.
- Durability/budgets/review: process `proc_477aa0145a49`, session `20261003_204928_a135b8`; owns setup-runtime.mjs and new completion tests only.
- Browser/scene acceptance: process `proc_b7ece206e302`, session `20261003_204928_ac8686`; owns scene/browser tests, not server/shared contracts.
- Trusted session enrollment: process `proc_50364c3906e7`, session `20261003_204928_4112ee`; owns current-work source/adapter/panel and tests; parent owns wiring.
- Recovery investigation: process `proc_d565bbeb61df`; read-only compatible recovery contract audit, launch only at checkpoint (session initialization not yet verified).

The first four workers emitted real tool_use events; none is yet accepted. All worker briefs prohibit business activity, spending/fallback changes, service/config/profile mutation, publication and worker spawning. Reports/streams under `/home/connor/.hermes/cache/scratch/completion-*` remain private local evidence, not public telemetry.

## Current blockers

All-path installed hard enforcement, actual whole-turn chat bounds, durable operational authority/session enrollment, complete browser acceptance, exact legacy recovery and independent release review remain open. Middleware exception fail-open behavior documented by official Hermes reference cannot serve as an independent hard gate. No blanket installed coverage will be inferred from unit fixtures or executor advertisements.

## Continuation evidence and ownership

- Parent-run broker regressions: **30 passed**; Control complete tests: **57 passed, zero failed**, followed by successful typecheck and diff check. The broker is source-only, not an installed executor or shared global provider quota. Physical cancellation and subscription transport remain unqualified.
- Uditus complete serialized suite: **787 passed, zero failed/cancelled/skipped**. This resolves the earlier serialized diagnostic outcome; it does not establish that the default parallel command passed or that production business adapters are ready. Existing stops remain in force.
- Parent recovery/deployment/readiness regressions: **39 passed, zero failed**. Fixes pin original absolute policy storage during recovery, require affirmative readiness, revalidate configuration paths/pending drop-ins and bindings around awaited health, and bound health-body and aggregate SSE work. Source fixes are not a service deployment.
- The real isolated measured recovery listener again returned `recoveryReady: true` and `transportReady: true`; `operationalRollbackExercised: false` and `serviceChanged: false`. All ten installed execution paths remain unverified. Exact private receipt: `/home/connor/.hermes/cache/scratch/completion-real-recovery-receipt.json`.
- A release verifier rerun encountered exclusive-report `EEXIST`; its old report is not new acceptance. Fresh verification uses `/home/connor/.hermes/cache/scratch/completion-viewer-release-reviewed-r2.json`, process `proc_fac980f58a78`; acceptance remains pending parent read-back.
- Native final-wire hardening: process `proc_092d8b86b0e3`; exclusive native worktree `agent/execution_policy.py` and its two regression files. No installed source changes. Broker dataclass/API shapes must be preserved; unsupported subscription routes remain held.
- Managed startup/executor foundation: process `proc_a20908467d6e`; exclusive new Control executor/startup source, tests and `docs/MANAGED-STARTUP.md`. Existing broker and native source are read-only for this worker. Shared integration/service/release edits remain parent-owned. Neither worker may start businesses, spend, widen routes/tools, change profiles/services, install dependencies or spawn workers.
- Both newly assigned workers emitted real tool events. Requested routing is `openai-codex` / `gpt-6.1-sol`; this is not a verified served-model, quota, billing or completed-artifact receipt.

Production was read back active on `/home/connor/armis-workshop-visibility-20261003`; no production switch or actual service rollback has occurred. Workshop has not been brought up as a completed release. The owner requested opening it only after completion.
