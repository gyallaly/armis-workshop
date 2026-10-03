# City V2 validation

Validated locally on the PC on 2026-10-03. The development preview is http://127.0.0.1:5173/.

## Visual audit and fixer rounds

1. Reviewed the campus, company floors, power island and controls at desktop sizes. Fixed oversized conduits, missing power-island minimap coverage, chat/minimap overlap, sparse role equipment, similar company roofs, Aster sign collisions and inconsistent tab layout.
2. Reviewed the revised floors and power controls at 1280 and 1440 pixels. Removed fabricated route guides, clarified FLOOR 01, added grounded company equipment, canopy supports and terrace rails, and corrected quota and allocation semantics.
3. Reviewed the final composition and zoom extremes. Fixed offscreen labels clamping over the water/chat, black canvas strips outside the campus bounds, and Campus reset retaining the power-station focus. Final screenshots show continuous water, readable labels and the same campus footprint for the selected first floor.

Review captures are in the ignored local screenshots/v2 directory, including release and controls-final. These are sampled visual checks, not proof that every possible runtime layout is defect-free.

## Automated verification

The final npm run verify completed successfully:

- TypeScript typecheck and production build.
- 101 domain/unit tests across 15 files.
- 7 runtime policy/HTTP tests.
- 3 deployment tests.
- 24 browser tests, including spatial floor dissolution, reduced motion, label separation, power-island selection, allocations, shutdown persistence, chat gating, source disconnection and company interactions.

The screenshot capture reported no browser errors or page overflow. Git diff whitespace checks passed.

## Runtime boundaries

The local demo exercises allocation admission, shutdown, resume, global stop and simulated status chat. It explicitly labels simulated data and messages. Provider totals, cost and machine metrics remain unknown when not reported.

The repository includes the authenticated control server, deterministic policy/admission protocol, deployment checks, runtime contract and Hermes installation brief. Real Hermes chat, cancellation, provider quota collection and machine metrics have not been verified against the installed Mini. Live controls remain gated until the installed executor supplies verified capabilities and fresh evidence. Git pull alone does not install the executor or activate these capabilities.

Dependency tracing and historical replay remain future extensions. They are not represented as live implemented features.

## Projection and scenery correction

After the owner's screenshot review, replaced the floor-image shear with footprint-aware plan projection followed by uniform world scale. Walls and agents now remain vertical while all four floor corners still match the exterior footprint. Corrected the campus opacity condition so unowned scenery cannot be mistaken for an unselected building shell.

Inspected new campus and all four company-floor screenshots at screenshots/v2/projection-fix, including 1280 and 1440 pixel captures. The capture reported no browser errors or overflow. All 102 unit/domain tests, the production build and five focused browser checks passed. Regression checks cover vertical elevation, exact floor corners and opaque scenery with infrastructure present.
