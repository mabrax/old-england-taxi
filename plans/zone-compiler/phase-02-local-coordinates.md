# Phase 02 — Local coordinates

## Goal

Convert the fixed snapshot's geographic coordinates into a stable local coordinate system measured in metres.

## Deliverable

A documented coordinate transform with the origin and orientation retained in the zone metadata.

## Implementation plan

1. Use the fixed source bounds' midpoint as the zone-wide WGS84 origin and define a right-handed, metre-based axis convention for Three.js.
2. Add a dependency-free local tangent-plane transform and apply it to every OSM node and every way with at least two resolved node references.
3. Keep the coordinate-system definition with the transformed zone data and expose a local inspection command for the fixed snapshot.
4. Cover complete point and line conversion, metadata, deterministic output, finite values, axis orientation, and distance accuracy with Vitest.
5. Run coordinate inspection, the existing source check, tests, type checks, and the application build to verify the phase boundary and exit condition.

## Technical decisions

- Convert WGS84 geodetic positions to Earth-centred coordinates, then rotate their offsets into the origin's local east/north tangent plane.
- Use `+x` for east, `+y` for up, and `+z` for south, so north is `-z` and the Three.js ground plane remains right-handed.
- Set `y` to zero because the OSM snapshot has no elevation and terrain is outside this phase.
- Require local horizontal distances across the fixed source to agree with WGS84 geodesic distances within 0.05 metres.
- Preserve source order, OSM identifiers, node references, closure, and tags; geometry interpretation remains with later phases.

## Success criteria

- Every supported point and line feature can be transformed from geographic coordinates into local metre coordinates.
- The transform uses one explicit origin and axis convention for the complete zone.
- Repeated transforms of the same input produce the same coordinates.
- Basic distance and orientation checks confirm that the local representation preserves the source layout within the agreed tolerance.

## Exit condition

The fixed snapshot can be represented in local coordinates without ambiguous axes, missing origins, or non-finite values.

## Out of scope

Road width inference, surface generation, building heights, street-graph construction, and live projection changes.
