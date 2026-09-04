# Phase 03 — Road surfaces

## Goal

Turn supported road centerlines into continuous, renderable surfaces in local coordinates.

## Deliverable

A triangulated road mesh built from inferred widths, buffered segments, and unioned intersections.

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
