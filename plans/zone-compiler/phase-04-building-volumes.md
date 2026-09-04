# Phase 04 — Building volumes

## Goal

Turn supported building footprints into simple, aligned 3D volumes.

## Deliverable

A deterministic building mesh for each supported footprint, using source heights when available and a defined fallback otherwise.

## Implementation plan

1. Extract closed `building=*` ways and way-based building multipolygons from the fixed snapshot, excluding `building=no` and all `building:part` geometry.
2. Keep each footprint ring on the Phase 02 local-metre coordinates and retain its source node references so alignment remains auditable.
3. Infer one height per footprint from a usable `height`, then `building:levels × 3 m`, otherwise the single 12 m fallback.
4. Triangulate roofs and floors, build closed wall quads for outer and inner rings, and emit a checked-in building-only preview alongside the Phase 03 road preview.
5. Verify extraction, holes, height precedence and fallback, boundary alignment, mesh validity, fixed-zone counts, byte stability, project checks, build, and desktop/mobile rendering.

## Technical decisions

- A supported way is a closed, non-degenerate way with a non-`no` `building` tag and no `building:part` tag. A supported relation is a `type=multipolygon` building whose outer and inner way members assemble into closed rings. Building parts remain excluded even when they also carry a building tag.
- Unitless `height` values are metres; explicit metre and foot units are accepted. Heights from 0.5 through 1,000 metres are usable. Otherwise, finite `building:levels` values from 0.5 through 200 use a fixed 3 metres per level.
- The only fallback is 12 metres. Building class does not alter it, so missing and unusable source values always resolve identically.
- Footprints are not clipped, simplified, snapped, or offset. Floors stay at `y = 0`, roofs use the inferred height, and every wall vertex reuses the exact horizontal coordinate of its footprint edge.
- Phase 04 emits a building-only viewport preview. Combining compiler outputs into the final zone artifact remains Phase 05.

## Success criteria

- Building footprints remain in their source positions after conversion to local coordinates.
- Known usable heights are applied consistently.
- Missing or unusable heights use one deterministic fallback rule.
- Extruded meshes are valid renderable geometry and do not introduce avoidable gaps or offsets at the footprint boundary.
- The fixed zone renders its building volumes together with the road surfaces.

## Exit condition

Each supported building footprint produces a stable 3D volume whose base aligns with the source footprint and whose height is explainable from source data or the fallback rule.

## Out of scope

Building parts, detailed roof shapes, terrain-following bases, interiors, materials, and landmarks.
