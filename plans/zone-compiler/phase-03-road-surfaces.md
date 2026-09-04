# Phase 03 — Road surfaces

## Goal

Turn supported road centerlines into continuous, renderable surfaces in local coordinates.

## Deliverable

A triangulated road mesh built from inferred widths, buffered segments, and unioned intersections.

## Implementation plan

1. Define the supported carriageway classes and infer each width deterministically from a valid `width` tag, then `lanes`, then a documented class fallback.
2. Buffer local-metre centerline segments with deterministic round joins, union all overlapping pavement, and clip the result to the fixed source bounds.
3. Triangulate every union polygon and hole into indexed, upward-facing, non-degenerate geometry while retaining enough compiler metadata to audit each road.
4. Generate a checked-in road-only preview from the fixed snapshot and replace the Phase 00 scene primitives with that continuous mesh, framed in the existing viewport.
5. Verify width precedence, buffering, intersection union, holes and triangulation, fixed-zone coverage, byte stability, source checks, tests, type checks, build, and the rendered viewport.

## Success criteria

- Supported road features receive a deterministic width from source data or the defined fallback rule.
- Centerlines are buffered into road-surface polygons in local coordinates.
- Intersections are unioned so connected roads do not leave avoidable gaps or conflicting internal seams.
- The resulting polygons triangulate into valid renderable geometry.
- The fixed zone shows a continuous road network in the Phase 00 viewport.

## Exit condition

Every supported connected street segment in the fixed zone has a valid surface mesh, and supported intersections render as connected driveable-looking pavement.

## Out of scope

Physics colliders, traffic rules, elevation, lane markings, terrain, and vehicle behavior.
