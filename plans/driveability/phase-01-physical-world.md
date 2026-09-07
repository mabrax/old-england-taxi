# Phase 01 — Physical world

## Goal

Give a loaded flat zone a bounded physical world suitable for one vehicle.

## Deliverable

A runtime-owned Rapier world with flat ground, collision against included building geometry, a documented play boundary, and clearance queries for the next phase. Include minimal collision inspection and lifecycle evidence.

## Success criteria

- The world consumes validated schema-v1 geometry in the existing east/up/south metre convention. Flat ground supports road and off-road movement; the road's display lift creates no physical step or duplicate contact surface.
- The collision representation preserves concavity, courtyard openings, and inner/outer walls. Checks distinguish a clear courtyard from a point inside a building; surface non-overlap alone is insufficient. Unmodeled/excluded source geometry is not invented.
- The play-envelope rule and stopping/recovery policy are agreed under the [stage constraints](./README.md#architecture-and-constraints). Mesh-union bounds, protruding buildings, out-of-cell graph endpoints, and the visual ground margin do not silently become the acquisition-cell boundary. The boundary can account for the later vehicle's full envelope.
- Physics initialization, fixed stepping with bounded catch-up, pause/resume, failure, and disposal have explicit ownership beside the existing renderer. Late initialization/unmount and repeated load/dispose leave no active stale world or loop; QA visibility does not mutate collision state.
- Focused geometry and probe-body checks cover ground support, building walls/corners, courtyard clearance, and boundary behavior. Initial world setup, collider counts, and memory/timing observations inform later performance budgets.

## Exit condition

A prepared cell has an inspectable, aligned physical world, and representative geometry checks pass without requiring a production vehicle. The chosen boundary and occupancy method are recorded; any necessary artifact dependency has been explicitly resolved before Phase 02.

## Out of scope

Vehicle tuning, production driving controls/camera, terrain-ready infrastructure, real-world barrier reconstruction, zone stitching, and compiler redesign.

## Dependency and planning agreement

Depends on the completed generation/loader foundation. The [stage working agreement](./README.md#working-agreement) applies: discuss and detail this phase's implementation plan with the user only when it is ready to begin. Rapier package/version and collider strategy are decisions for that plan; this brief installs nothing. Vehicle-scale verification follows in [Phase 02](./phase-02-first-vehicle.md), and integration/performance qualification follows in Phase 04.
