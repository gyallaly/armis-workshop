# The Core and city visual upgrade

The owner selected concept 2, The Core, on 2026-10-03. The requested "64 bit" direction is implemented as a citywide increase in visual fidelity; it is not a new numeric pixel format.

The procedural Canvas renderer now uses three-times-resolution static textures, smooth architectural polygons, directional material gradients and smooth sampling. Logical dimensions remain independent of texture dimensions. Vegetation, agents, portraits, status bubbles and wall signage use smooth geometry or typography. Campus contact shadows, window lighting and ocean detail were revised.

The station uses a circular seawall, concentric maintenance deck, perimeter rails and lights, rear command hall, source-derived provider reactors and front distribution nexus. Quota gauges and warnings retain evidence requirements. Pointer and keyboard provider inspection expose the existing capacity information; company allocations, shutdown controls, owner reserve and chat remain on their existing authenticated contracts.

The floor footprint mapping is unchanged and tested. Rear envelopes now connect across department bay gaps. Walls share the same main height and trim does not bridge partition doorways. Furniture, jobs, navigation and foreground occlusion remain in the same world coordinates.

Visual captures were inspected in screenshots/v3/core-first, core-review and core-delivery, including the campus, four floors, station, controls and 1280/1440 layouts. Review fixed portrait cropping, texture sizing, wall joins, overlapping conduit drawings and equipment draw order. Capture reported no browser errors or page overflow.

Validation: 103 domain/unit tests, production typecheck/build and all 24 browser checks passed. A test selector capitalization error was repaired and the final full browser run passed. Installed Mini performance and live executor coverage remain unverified. The generated concept is an architectural reference; the current result is procedural Canvas artwork, not the generated image used as a static background.

Follow-up: restored the owner's original pixel-art people and portraits while retaining smooth architecture. Moved the Core center to (-192,206), leaving more than 100 world units of ocean between the island and mainland. Supply pipes now run at elevation 12 with piers, foundations, saddles, collars and terminal risers. One southern trunk splits into the Uditus/Aster branches without overlapping shared segments. Removed old static dotted route guides. Irregular rocky shorelines and waterline ripples surround both islands. Shared layout geometry updates camera framing, minimap, reactor hit areas and labels together. Tests cover offshore clearance, pipe elevation, support placement and absence of overlapping/crossing route interiors.

Offshore follow-up validation: all 106 unit/domain tests, production typecheck/build and five focused browser checks passed. Inspected campus, station and floor captures in screenshots/v3/offshore-review at 1280/1440 widths; no browser errors or page overflow were reported. Shoreline gaps and rock clusters are irregular, and the supply landing is reserved from trees and rocks.
