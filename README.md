# Armis Workshop

An interactive, isometric pixel-art viewer for the Hermes workshop. It shows a campus of businesses: Hermes HQ, Uditus, Etsy Studio (provisional) and Aster Ledger (provisional, paper trading only). You can walk through their interiors, follow workers and tasks, and inspect AI provider capacity.

**Live is the default: read-only, local observed telemetry.** A single loopback service serves the built dashboard and sanitized SSE. It can read an explicitly bound Hermes session or an existing sanitized Armis journal; without an opted-in source it stays disconnected. Demo remains a separate explicitly selected simulation. No provider account access, AI calls, execution host, credentials in the frontend, or operational business activation is involved. See [docs/LIVE-INTEGRATION.md](docs/LIVE-INTEGRATION.md) for the actual connection and its observation limits.

## Current Mac installation

See [docs/MAC-LIVE-ACTIVATION.md](docs/MAC-LIVE-ACTIVATION.md) for Connor’s update combined with the installed viewer fixes, actual setup-runtime journal, optional Uditus read-only records, missing task-schema gap and rollback. Inside **Armis Syndicate HQ → Activity → Runtime evidence**, inspect installed bindings, Operations/worker/review receipts and unreleased internal results. Missing Uditus task tables never block HQ.

## Run it

Requirements: Node.js 24+ for the Live service (verified on Node 26.7.0). No secrets or `.env` are needed.

```bash
npm ci
npm run dev          # http://127.0.0.1:5173
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests: reducer, selectors, demo determinism, Aster Ledger |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serve `dist/` on http://127.0.0.1:4173 |
| `npm run serve:live` | Serve the built dashboard and same-origin read-only SSE on 127.0.0.1:4173; source must be explicitly bound |
| `npm run test:e2e` | Playwright browser tests (Chromium; verified on Ubuntu with `PW_CHANNEL=chrome`) |
| `npm run verify` | All of the above |

## Using the viewer

- **Campus**
  - Drag to pan, scroll to zoom, or use `+`/`-`/`0` and the arrow keys when the scene has focus.
  - Hover a building to highlight it. Click it, or its label button, to go inside.
  - The HQ chip next to the Hermes label summarises AI capacity.
- **Interior**
  - Breadcrumbs or `Esc` return to the campus.
  - Click a worker or a room. Use **Follow worker** to keep the camera on someone.
  - Glowing guides show the task routes. Travelling dots are real handoff events from the stream; click one to see the task, its source and destination, and the outcome.
- **Side panel**
  - **Activity** shows a featured worker, the roster and the event feed, plus the Aster Ledger paper book when you're inside it.
  - **Tasks** is a filterable list, so you can inspect everything without using the canvas.
  - **AI capacity** shows provider scopes with provenance on every value.
- **Worker and task detail**
  - Shows criteria, timeline, findings, attempts and IDs.
  - **Redirect task** opens a simulated composer that moves through requested, acknowledged, then applied or rejected.
  - **View evidence** shows artifacts.
- **Demo bar**
  - Live opens by default. Explicitly select Demo for simulated controls, scenarios and playback.
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
- **Stale or disconnected workers aren't shown working.** They appear as *unknown* (grey with a ?), and offline workers appear faded by the entrance. They are never drawn working.
- **Capacity is shared, with provenance.** Every value carries a source: provider reported, locally measured, estimated or unknown. Shared scopes are never split per worker, and remaining quota is never inferred.
- **Redirect is simulated in demo mode.** It's disabled when live is disconnected, while reconnecting, when the worker is stale, and when the worker isn't on the task. There is no command box.
- **Aster Ledger is paper only.** There is no place, buy or sell control anywhere. The board says "Best observed net price", never "best odds".

## Layout

```
src/core/       types, config (businesses, roster), reducer, selectors, normalize, rng
src/adapters/   adapter contract, disconnected live adapter, demo adapter + seeded sim, Aster Ledger model
src/scene/      Canvas2D pixel-art renderer: campus, interiors, sprites, actors, traffic, camera
src/ui/         React panels, dialogs, store (state + preferences)
tests/          Vitest unit tests        e2e/  Playwright browser tests
docs/           ARCHITECTURE.md, LIVE-INTEGRATION.md
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/LIVE-INTEGRATION.md](docs/LIVE-INTEGRATION.md) and [ASSETS.md](ASSETS.md).

For city expansion, follow [docs/BUILDING-SPEC.md](docs/BUILDING-SPEC.md). It defines island placement, building geometry, navigation, labels, Control mappings and acceptance checks. `AGENTS.md` directs future agents to this contract.

## Status and known gaps

- The scene is procedurally drawn. It follows the approved mockups' composition and mood but is not pixel-identical, and closing the fidelity gap is ongoing work.
- The multi-worker demo is an aspirational simulation. The documented Uditus workshop runs create, review, repair serialized with bounded repair; this viewer does not claim the current deployment runs this many workers.
- The local Live integration observes only its explicitly bound source, not all Hermes activity. Business acceptance, quotas and unbound sessions remain unobserved. It never contacts a provider or trading venue. See the integration and source-mapping docs.
