# Phase 05 — Zone artifact

## Goal

Package the generated geometry and navigation data into one deterministic artifact that the browser can load.

## Deliverable

A versioned zone artifact containing renderable geometry, the street graph, coordinate metadata, and source metadata.

## Implementation plan

1. Define a versioned, runtime-validated artifact contract that combines the Phase 03 road mesh, Phase 04 building mesh, local-coordinate definition, source provenance, bounds, and auditable statistics.
2. Derive a deterministic street graph from every supported road centerline segment that contributes to the clipped road surface, retaining OSM node and way provenance without adding routing semantics.
3. Add stable serialization plus local write, freshness-check, and inspection commands, and check in the single generated artifact under the browser's static assets.
4. Replace the two bundled preview imports with an asynchronous browser loader that validates the prepared artifact before constructing the existing Three.js scene and reports load/schema failures in the viewport.
5. Verify schema rejection, graph correspondence, byte stability, offline reproducibility, loader behavior, all existing checks, the production bundle, and desktop/mobile viewport behavior including reset, errors, and overflow.

## Technical decisions

- Store one compact JSON artifact with explicit schema version `1`; canonical key ordering and a trailing newline define its stable byte representation.
- Keep compilation and source data in the local Node tool. The browser fetches only the prepared artifact and shares a dependency-free artifact validator, so compiler geometry code cannot enter the client bundle.
- Model the street graph as undirected OSM centerline segments selected by the same fixed-zone intersection rule used by the road compiler. Nodes retain local positions and source node IDs; edges retain source way IDs, class, width, and length. Direction and routing policy remain deferred.
- Serve the checked-in artifact from `public/zones/` so its large geometry arrays remain a separate cacheable resource instead of being transformed into the application JavaScript bundle.

## Success criteria

- One compiler run emits all geometry needed to render the fixed zone.
- The artifact includes a street graph that corresponds to the compiled road network.
- The artifact includes the coordinate transform and source metadata needed to interpret it.
- Serialization is stable, so the same snapshot and configuration produce the same artifact content.
- The Phase 00 application can load the artifact and render the fixed zone without compiler code running in the browser.

## Exit condition

The fixed zone can be compiled, loaded, and rendered end to end from the checked-in snapshot, with deterministic output and no missing geometry or metadata required by the client.

## Out of scope

Vehicle physics, route selection, dynamic generation, terrain, detailed landmarks, and training-session features.
