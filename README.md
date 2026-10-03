# Armis Workshop

Version 2 is an interactive isometric operating campus for ARMIS: Hermes HQ, Uditus, Etsy Studio and Aster Ledger (paper only). Buildings open as first-floor cutaways at their actual campus footprints, with a camera zoom and dissolving upper shell. An offshore power station exposes provider supply, owner allocations and usage. There are no decorative people implying execution.

**The default experience is deterministic simulation.** Company controls genuinely gate simulated operations; simulated chat is a local status assistant. Live mode supports the installed viewer's named SSE protocol and authenticated owner-service contracts. Real Hermes execution and chat require a supported, independently verified executor bridge on the Mini. Missing measurements and unsupported controls remain unknown or disabled. No live Mac deployment has been verified from this PC.

## Run it

Requirements: Node.js ≥ 22.22. No secrets or `.env` are needed for the simulation.

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests: reducer, selectors, demo determinism, Aster Ledger |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serve `dist/` on http://127.0.0.1:4173 |
| `npm run test:e2e` | Playwright browser tests (uses the system Microsoft Edge; set `PW_CHANNEL=chrome` elsewhere) |
| `npm run verify` | All of the above |
| `npm run serve:live` | Installed loopback viewer and authenticated owner service |
| `npm run test:runtime` | Durable policy, executor contract and HTTP boundary tests using fixtures |
| `npm run test:deployment` | Transport-readiness fixture tests |
| `npm run check:mac` | Read-only installed loopback transport check |
| `npm run deploy:mac -- --apply` | Configured Linux updater activation, checks and rollback; refuses dirty installations |

## Using the viewer

- **Campus**
  - Drag to pan, scroll to zoom, or use `+`/`-`/`0` and the arrow keys when the scene has focus.
  - Hover a building to highlight it. Click it, or its label button, to go inside.
  - Click the offshore power station to zoom into its provider reactors and open its inspector.
- **Interior**
  - Breadcrumbs or `Esc` return to the campus.
  - Click a worker or a room. Use **Follow worker** to keep the camera on someone.
  - Floor 01 stays in the building footprint. Travelling dots and delegation pulses derive from events, simulated in Demo; no fabricated route activity is drawn.
- **Side panel**
  - **Activity** shows a featured worker, the roster and the event feed, plus the Aster Ledger paper book when you're inside it.
  - **Tasks** is a filterable list, so you can inspect everything without using the canvas.
  - **AI capacity** shows provider scopes with provenance on every value.
  - **Power** exposes providers, company allocation and operating controls, hardware observations and outcome counts.
  - **Connections** distinguishes transport readiness from source-feed evidence.
  - **Guide** explains every light, pipe, marker and operating state in plain language.
  - **Talk to Hermes** opens a persistent textbox with explicit recipient and delivery status. Real chat is disabled until its installed capability is verified.
- **Worker and task detail**
  - Shows criteria, timeline, findings, attempts and IDs.
  - **Redirect task** opens a simulated composer that moves through requested, acknowledged, then applied or rejected.
  - **View evidence** shows artifacts.
- **Demo bar**
  - Choose the source (Demo or Live, which is not connected), pause or resume, set the speed, and pick a scenario.
  - **Reset** replays the same seeded run.
  - **Drop stream** simulates a disconnect followed by a reconnect snapshot.
  - The Motion setting can be System, Full or Reduced.
- **Lights out:** when every provider scope reports *unavailable*, the scene goes dark until capacity resets. Unknown capacity never triggers this.

### Scenarios

| Scenario | Shows |
| --- | --- |
| Steady evening | Codex *limited* (provider-reported); Gemini available but its remaining allowance is *not reported* |
| Codex out until reset | Codex returns 429 until a simulated reset; Gemini picks up eligible work; Codex-only work waits |
| Both providers out | Lights out; jobs stay queued; Gemini has no reset hint |
| Stream drop + reconnect | Workers go stale and *unknown*, then a reconnect snapshot restores them |
| Ledger: stale quotes / conflicting sources / failed audit / provider unavailable / no eligible opportunity | The Aster Ledger rejection paths |

## Honesty rules the viewer enforces

- **Readiness is explicit.** A task becomes Ready only on an explicit `task.ready` event, never because events stopped. Ready is **not** permission to send or publish.
- **Outcomes are never assumed.** An attempt with no observed outcome shows "outcome not observed".
- **Stale or disconnected workers aren't shown working.** They appear as unknown. Confirmed idle/offline identities have stable lounge seats; stale observations retain muted last-known positions.
- **Capacity is shared, with provenance.** Every value carries a source: provider reported, locally measured, estimated or unknown. Shared scopes are never split per worker, and remaining quota is never inferred.
- **Owner commands require receipts.** Requested or acknowledged does not mean effective. Live cancellation can remain stopping while residual work is unresolved. Redirect remains simulated in demo and disabled for unsupported live transport.
- **Aster Ledger is paper only.** There is no place, buy or sell control anywhere. The board says "Best observed net price", never "best odds".

## Layout

```
src/core/       types, config (businesses, roster), reducer, selectors, normalize, rng
src/adapters/   adapter contract, disconnected live adapter, demo adapter + seeded sim, Aster Ledger model
src/scene/      Canvas2D smooth architectural renderer: campus, interiors, sprites, actors, traffic, camera
src/ui/         React panels, dialogs, store (state + preferences)
tests/          Vitest unit tests        e2e/  Playwright browser tests
docs/           ARCHITECTURE.md, LIVE-INTEGRATION.md
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/LIVE-INTEGRATION.md](docs/LIVE-INTEGRATION.md) and [ASSETS.md](ASSETS.md).

For city expansion, follow [docs/BUILDING-SPEC.md](docs/BUILDING-SPEC.md). It defines island placement, building geometry, navigation, labels, Control mappings and acceptance checks. `AGENTS.md` directs future agents to this contract.

## Status and known gaps

- The scene is procedurally drawn. It follows the approved mockups' composition and mood but is not pixel-identical, and closing the fidelity gap is ongoing work.
- The multi-worker demo is an aspirational simulation. The documented Uditus workshop runs create, review, repair serialized with bounded repair; this viewer does not claim the current deployment runs this many workers.
- Live observation and owner-service contracts are built and fixture-tested. The installed Hermes bridge, complete execution gate coverage, provider quota evidence and Mac deployment remain unverified. See [V2 runtime contract](docs/V2-RUNTIME-CONTRACT.md) and [Hermes installation brief](docs/HERMES-V2-IMPLEMENTATION.md).
