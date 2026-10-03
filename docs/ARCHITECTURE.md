# Architecture

## Stack, and why

- **TypeScript + React 19 + Vite 8**: a small, maintained, fast-building component UI. All dependencies are pinned exactly in `package.json`.
- **Canvas 2D for the scene**: there is no WebGL engine.
  - The art is drawn once, at "art-pixel" resolution, into offscreen canvases. Each frame upscales those with nearest-neighbour sampling and draws only the animated layers on top: workers, dots, water, tickers.
  - This is cheap enough for an Intel Mac mini with 8 GB RAM and no GPU-heavy effects.
  - Frame rate is capped near 30 fps, and hidden tabs pause rendering. The demo stream also slows to one step per second while the tab is hidden.
- **Interface text is DOM**: labels, panels and dialogs are sharp, accessible HTML positioned over the canvas. Only in-scene signage is pixelated.
- **Vitest** for the logic. **Playwright**, driving the system Edge, for browser interaction tests.

## Data flow

```
 adapter (demo sim | configured read-only SSE | disconnected live)
   │  snapshot(), events[], connection(), tick(), reset()
   ▼
 WorkshopStore (src/ui/store.ts)  ── stamps receivedTs, batches per frame
   │  reduce(state, action)       ── pure, src/core/reducer.ts
   ▼
 WorkshopState ──► selectors (displayStatus, counts) ──► React panels
                                         └────────────► scene (actors, dots, labels)
```

- **One state for everything.** Business logic is independent of rendering. The scene, the counts, the task list and the timelines are all derived from the same `WorkshopState`, through `displayStatus()` and the count selectors.
- **Event contract** (`ActivityEvent`): every event has a unique id, a source timestamp, a received timestamp, business/worker/task/attempt/session ids, a type, and a sanitized payload. It carries observable actions and evidence only, never private model reasoning.
- **What the reducer guarantees:**
  - **Boundary validation:** `normalizeEvent`. Unknown enum values become `unknown`, and malformed events are dropped.
  - **De-duplication:** a bounded ring of seen ids.
  - **Out-of-order safety:** per-entity source clocks. A late event can't overwrite newer state, but it still lands in the timeline in source order.
  - **Write-once outcomes:** attempt outcomes are never rewritten, and redirect states never regress.
  - **Snapshots:** a snapshot replaces observed state; an older snapshot is ignored; roster identity is always kept.
  - **No assumed success:** missing events never imply success; Ready needs an explicit event.
  - **Bounded memory:** timeline, per-task timeline, traffic, redirects and finished tasks all have caps.
- **Identity:** a stable `Worker` (name, look, home department) is separate from ephemeral `Attempt`/session ids. Business and department mapping is explicit (`departmentForStage`) and never guessed from prompt text.
- **Persistence:** preferences and roster identity go to `localStorage`. Live status is never persisted.

## Demo adapter

- **`DemoSim`** (`src/adapters/demo/sim.ts`) is a deterministic discrete-event simulation.
  - It has one seeded RNG, a time-ordered queue and a stable tie-break, so `advanceTo(T)` gives identical events however time is chunked.
  - It keeps its own "truth" by running the same reducer, and that truth is what reconnect snapshots come from.
- **`DemoAdapter`** plays the sim in scaled real time.
  - It injects duplicate and late deliveries on purpose, so the reducer's safeguards are exercised continuously.
  - It supports pause, speed, reset (same seed, same run), scenarios and simulated stream drops.
- **Aster Ledger** (`src/adapters/demo/ledger.ts`) is an isolated paper book with its own RNG stream. It shares only the event contract, capacity infrastructure and presentation components. Its state reaches the viewer as `ledger.updated` events.

## Scene

- `campus.ts` and `interior.ts` build static art layers plus hit areas, routes and label anchors.
- `actors.ts` moves workers based on `displayStatus`:
  - Active workers sit at desks and their monitors light up.
  - Confirmed idle workers leave their desks for the lounge (coffee, sofa).
  - Waiting and failed workers stay at their desks with icons.
  - Confirmed offline workers occupy stable lounge spots with an offline indicator.
  - Unobserved identities begin muted in their home lounge. Stale observations freeze the last known position; neither is presented as confirmed idle.
- `traffic.ts` draws handoff dots from `task.handoff` events, using shape as well as colour.
- `operations.ts` derives small entry lamps from agent display states, job folio marks from recorded task criteria, and brief assignment pulses from timeline events. Agent handoffs require a recent completed prior attempt; only demo simulates delegation through declared supervisors. Missing agent endpoints retain the department-level traffic route. Job folios belong to workstation anchors and open the existing task panel through canvas hit testing or keyboard controls.
- **Reduced motion** (from the OS or the in-app setting) stops ambient animation, travelling dots and camera easing.

## City integrity

Interior navigation uses the same geometry footprints as rendering. Visibility-graph routes pass through actual door openings and avoid furniture; workers receive unique seats. Depth layers restore foreground walls, desks and monitors over actors while preserving finished decoration. Campus pedestrians likewise respect static foreground objects. Labels are placed against viewport margins, the toolbar, minimap and other labels; camera fit reserves that space.

`tests/navigation.test.ts`, `tests/labels.test.ts` and `tests/boundaries.test.ts` cover movement, label placement and state boundaries. `e2e/city.spec.ts` verifies all five views at fit/minimum/maximum zoom at 1280 and 1440 widths. The organization view shows declared Control roles separately from simulated sessions.

## Authoritative organization and occupancy

`core/control-registry.json` pins the 29 declared roles from Control at `100537aac66c4f597ace5d24b2da8155b6a14f9c`. `organization.ts` maps those declarations to city business IDs; `config.ts` derives every character and its responsibility workspace. HQ has five roles, each company eight. Appearance preferences cannot replace canonical identities. Every identity has a unique stable lounge location and sufficient reachable workspace seating.

`reconcileCity` checks declaration completeness, home ownership, observations, job/attempt associations and count totals. A failed worker can retain its completed attempt while the job is unassigned. Active workers must match current assignment. Organization panels expose these diagnostics.

`LiveBridgeAdapter` consumes an explicitly configured sanitized SSE endpoint. Only a validated snapshot establishes a connection; reconnects require another snapshot before events are accepted. The adapter rejects unknown identities and cross-company observations, stamps arrival timestamps locally, and offers no control capability. Transport tests use simulated fixtures; actual Mac mini connectivity remains unverified until an endpoint is supplied.
