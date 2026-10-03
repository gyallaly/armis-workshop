# City reflection implementation status

The requested scope is all five steps below. The user clarified that live Mac mini connectivity is deferred: implement and verify the UI against the declared Control architecture and simulated states. Real runtime verification is future integration work, not a blocker for this UI scope.

All five UI steps are implemented and verified within that scope. The final source-reset change passed typecheck/build and three targeted browser checks after the full 17-test suite. No live connectivity claim is made.

| Step | Current evidence | Remaining verification |
| --- | --- | --- |
| 1. Replace fictional roster with declared Control roles | `core/control-registry.json` contains the 29 declarations at `100537aac66c4f597ace5d24b2da8155b6a14f9c`; remote HEAD was verified at the same ref. `tests/city-model.test.ts` checks exact identity completeness and ownership. | Runtime deployments can differ from the repository; compare the connected Mac mini registry when available. |
| 2. Give each identity a home, responsibility and lounge place | Roster derives from declarations. All four interiors have enough workspace seats and unique stable lounge spots. Navigation tests exercise every spot. Actor tests verify idle placement, frozen stale positions and separation of full sprite bounds for all eight lounge locations. | Real observations remain future integration work. |
| 3. Rebuild interiors around real roles | HQ has leadership, finance, efficiency, audit and operations rooms. Companies have leadership, research, quality and delivery. HQ and all three company interiors were visually inspected. Legacy windows behind responsibility screens were removed, and fresh company canvas captures verified the correction. | Verify occupancy against actual runtime observations when connected. |
| 4. Connect observed jobs/sessions to movement | Read-only SSE adapter validates snapshots/events; integration tests follow decoded data through reducer, actor positions and session counts. Errors require a new snapshot before event ingestion resumes. | No actual Mac mini telemetry URL or recorded real stream has been supplied. Live connection and real occupancy are unverified. Simulation is clearly labeled. |
| 5. Reconcile identity, assignment and count inconsistencies | `core/reconcile.ts` checks missing agents, wrong homes, orphan jobs/attempts and inconsistent counts. Organization panels expose issues. The deterministic demo is checked across five minutes. | Exercise reconciliation against the real bridge and deployment registry. |

Latest checks: build/typecheck and 69 unit tests passed after lounge spacing changes. The full 17-test browser suite passed, including all five views at fit/minimum/maximum zoom at 1280 and 1440 widths and horizontal overflow checks. Full eight-character lounge occupancy was visually inspected. Source changes reset actor positions so simulated desks cannot masquerade as last-known live observations. Localhost remains available at `http://127.0.0.1:5173/`.

Do not treat passing simulated fixtures as a live-system audit. Bridge setup and data semantics are documented in `LIVE-INTEGRATION.md`. When connectivity is requested later, validate real snapshots, compare runtime declarations with the registry, and exercise work, idle, failure, disconnect and reconnect against real events.
