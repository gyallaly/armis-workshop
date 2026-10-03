# ARMIS city building specification

This is the implementation contract for agents adding or changing city buildings. Read this file and docs/ARCHITECTURE.md before editing the city.

## Purpose and setting

The city reflects ARMIS: persistent identities, companies, departments, workers and jobs. It is a night-time isometric pixel city on one island, surrounded by open water. Geometry must be precise and interactions must reveal truthful system information. Decorative pedestrians are ambient characters, never evidence of agent execution.

## Expansion rules

- The current island occupies world coordinates x=0..480, y=0..480 in src/scene/campus.ts. Buildings, landscaping and pedestrian routes must stay on land. Water starts outside this boundary. The seawall and promenade define its edge.
- Do not add background buildings, hidden mainland, disconnected bridges or props floating over water. Expand the island boundary deliberately before adding a district that cannot fit. Update shoreline, promenade, camera fit, minimap and paths together.
- Plan each footprint, entrance, height, signage zone, label anchor and route before drawing. Reserve clear approach space and room for landscaping. Do not squeeze buildings into leftover gaps.
- Keep real operational buildings visually distinct. Decorative structures must not imply companies or agents that do not exist. Do not create interactive empty buildings unless the user requested them.

## Required building record

Record the stable city ID, corresponding Control business/role ID, display name, purpose, footprint, height, ground elevation, entrance coordinate, label/focus anchors, departments, ownership hierarchy, data source and unknown fields. Explicitly identify whether it is operational, declared-only or decorative. Never derive identity from prompt text or visible labels.

## Exterior geometry and art

- Use shared Iso/pixel helpers and the existing art scale. Foundations touch the land plane; roofs, walls and windows align with their face projection.
- Allocate wall signs before windows, screens and posters. Signs have a clear rectangular area with no decoration behind their lettering.
- Define the BuildingHit hull, label, focus and door from the same footprint used to draw it. Hit areas must follow the visible structure and not steal adjacent interactions.
- Include every physical object in foreground occlusion caches. Preserve finished artwork in those layers. Sort by world depth; pedestrians behind a facade or tree must be concealed.
- Exterior task routes reach the actual entrance, avoid footprints and stay on connected paths. Update tree/prop exclusion zones whenever paths or buildings change.
- Keep lighting local and coherent. Water reflections stay on water. No unrelated style, blur or new pixel scale for an individual building.

## Interior and movement

- Define departments and floors from business configuration, with actual doorway gaps in wall geometry. A painted floor patch is not an opening.
- Rendering and navigation share physical obstacle footprints. Route workers and task traffic through doors and clear corridors, around desks and furniture. Raised monitors/lintels occlude but do not block the floor.
- Assign unique reachable desk seats. Lounge seats require approach/departure points in front of furniture. Every configured seat and department route must be reachable.
- Draw actors with foreground occlusion, preserving wall/furniture details and glass transparency. Never repaint opaque rectangles over characters.
- Unknown/offline workers stay visibly distinct. Reduced motion immediately stops travel/easing, including routes already in progress.

## Information and system plumbing

- Register the business and departments in src/core/config.ts; extend exhaustive types/selectors where required. Add explicit Control mapping in src/adapters/control.ts when applicable.
- Preserve owner/CEO/coordinator/worker hierarchy separately from observed sessions. A declared persistent identity does not prove an active runtime.
- Use validated snapshots/events through the existing adapter and reducer contracts. Do not bypass normalization or manufacture timestamps, stage, capacity, worker/session IDs, repair policy or completion.
- Readiness requires explicit task.ready. Show absent telemetry as unknown/not reported; stale states must not contribute fresh active/capacity counts.
- Keep demo and live provenance visible. A new building must work with disconnected, stale and empty data. Do not invent endpoints or enable control actions just to make the UI look populated.
- Connect selection, roster, tasks, evidence, organization, follow camera, legend and campus navigation. Legends describe the actual business workflow, not a generic pipeline.

## Labels and interaction

- Use shared collision-aware label placement and camera clearance. Labels stay inside the safe viewport and avoid each other, the minimap and toolbar at fit/minimum/maximum zoom.
- Prefer compact labels when space is limited. Never hide a building's identity or rely on overflowing text. Preserve accessible names, keyboard entry, focus and Escape navigation.
- Building entry runs once per action. A transition must not erase a subsequent worker/task selection.

## Acceptance and handoff

1. Run typecheck/build and relevant unit tests. Add meaningful navigation tests for every new seat/department and boundary tests for new data contracts.
2. Verify every affected view at 1280x720 and 1440x900, at fit/minimum/maximum zoom. Include campus labels and the new interior in e2e/city.spec.ts.
3. Visually inspect moving workers, doors, wall signs, monitors, sofas, foreground facades and water boundaries. DOM label checks do not prove canvas geometry is correct.
4. Exercise demo, disconnected, stale/reconnect and reduced motion. Check browser errors and keyboard navigation.
5. Save a representative screenshot. Report changes, checks and any remaining unconnected telemetry. Leave localhost running for review.

An addition is complete only when exterior, interior, movement, interaction and data meaning agree. Do not claim live connectivity or defect-free rendering beyond what was actually verified.

## Current building records

All footprints use world coordinates, ground elevation 0, and declared Control identities. Observed execution remains demo data or disconnected live data. Label/focus/hull coordinates are derived in src/scene/campus.ts; department and ownership registries live in src/core/config.ts and src/adapters/control.ts.

| City ID | Control ID | Purpose | Footprint x/y | Highest art height | Entrance | Departments |
| --- | --- | --- | --- | --- | --- | --- |
| hermes-hq | armis | Group leadership and oversight | x130..236, y118..212 | 152 | (214,216) | Leadership, Finance, Efficiency, Quality, Operations, Lounge |
| uditus | uditus | Delivery workshop | x92..186, y300..392 | 74 conservative hull | (188,346) | Leadership, Research, Quality, Delivery, Lounge |
| etsy-studio | etsy | Commerce studio | x300..392, y92..186 | 74 conservative hull | (346,188) | Leadership, Research, Quality, Delivery, Lounge |
| aster-ledger | aster | Paper market research and portfolio | x340..430, y340..430 | 84 conservative hull | (388,432) | Leadership, Research, Quality, Delivery, Lounge |

HQ's crown, emblem band, podium sign and lobby use separate height zones. Its command floor has tiled surfaces and spaced consoles, with unchanged department authority. Studio logos compose with cached object transforms. Exterior buildings and landscaping share one depth-sorted draw pass so background foliage cannot appear on roofs.

Each declared role receives one permanent character and a stable home lounge spot. Confirmed idle/offline agents occupy that lounge. Working/waiting/failed agents occupy responsibility workspaces. Sessions never create extra permanent characters. Missing telemetry is unknown; freeze a previously observed character at its last position rather than inventing a return to the lounge. Check `reconcileCity` after changes to identities, assignment semantics or department mappings.
