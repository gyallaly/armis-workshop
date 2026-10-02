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
 adapter (demo sim | disconnected live)
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
  - Offline and unknown workers stand faded by the entrance, never animated.
- `traffic.ts` draws handoff dots from `task.handoff` events, using shape as well as colour.
- **Reduced motion** (from the OS or the in-app setting) stops ambient animation, travelling dots and camera easing.
