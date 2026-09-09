# Phase 01 — Physical world

**Status: complete (2026-09-07).** The exit condition is met for this phase's declared static-world and probe scope. [Verification and limitations](./phase-01-verification.md), [world measurements](./phase-01-measurements.json), and [browser/camera evidence](./phase-01-browser-verification.json) record the results. Phases 02–04 remain unstarted; there is no production vehicle or driving qualification.

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

Depends on the completed generation/loader foundation. The user authorized Phase 01 implementation on 2026-09-07, including reasonable architecture decisions within this scope. Vehicle-scale verification follows in [Phase 02](./phase-02-first-vehicle.md), and integration/performance qualification follows in Phase 04.

## Implementation plan (2026-09-07)

1. Start an isolated `codex/driveability-physical-world` branch from planning commit `8757011`, retaining foundation `712fe6f` and both planning commits. Leave canonical main, its preview/cache, and prepared artifacts untouched.
2. Pin the current official `@dimforge/rapier3d-compat` package (0.20.0). Lazy-load its bundled WASM once per page, with each scene owning a separate world. Keep the ray-cast vehicle direction for Phase 02; add no vehicle or driving input now.
3. Use one fixed cuboid ground with its top at y=0. Keep the complete unscaled building triangle mesh, including roofs, inner/outer walls and base caps. Do not add road colliders or copy its visual 4 cm lift. Building bases coincide with ground only under occupied building footprints, which clearance rejects; road/off-road/courtyard support comes from one ground collider. QA is never physics input. Contact experiments showed that stripping base caps worsens corner CCD: retaining the closed mesh, fixing internal triangle-edge normals and using up to eight CCD substeps passes the declared probe checks without changing source geometry.
4. Derive the play rectangle from minimum/maximum X/Z of the clipped-road vertices, inset **1 m on every side**. Reject a collapsed rectangle. Building extents, graph endpoints and renderer padding have no influence. Four 1 m thick fixed walls lie outside its edges, extending from y=-1 to y=20, with visible amber edges even when QA/generated geometry is hidden. This is a simulation envelope, not an exact projected source polygon or road-access guarantee. Sparse roads can make it much smaller; its rectangle can include off-road land/water and its corners are not certified acquisition edges. No artifact extension is needed for this policy.
5. Query an explicit world-axis-aligned box and additional nonnegative horizontal boundary margin. This represents the complete future vehicle envelope conservatively at any orientation; Phase 02 must supply dimensions, suspension/travel and movement/braking margins. Return boundary, ground and building occupancy reasons. Occupancy uses overlap against projected roof triangles extruded from y=0 to their roof height, including triangle/rectangle separating axes, rather than only point samples or Rapier surface overlap. Compiler flat caps/walls are checked for compatibility; roof holes and concavity remain empty. This indexes existing artifact triangles, with no footprint reconstruction or compiler imports in the runtime.
6. Own fixed 1/60 s steps in the existing renderer loop, capped at five steps per frame; discard excess elapsed time. Start paused, expose inspection-only pause/resume and collider visibility, pause on hidden/page focus loss and require explicit resume. Resume clears the clock. Initialization/failure/disposal must not revive a scene or leak a partial world. Shared WASM code remains page-owned; per-world allocations are explicitly freed.
7. Define later recovery policy now: the boundary stops ordinary departure; an escaped full envelope, nonfinite pose, or vertical envelope outside [-2,20] requires stopping and revalidation/reset in Phase 02. Do not clamp or teleport production bodies in this phase. Probe tests establish limited contact evidence, not vehicle-speed qualification.
8. Verify controlled flat extrusions (concavity, courtyard, overlap, inner/outer walls, corners), road/off-road support, all boundary faces, invalid clearance inputs, and repeatable load/pause/failure/dispose. Measure all prepared cells offline and record initial setup/step/resource observations. Run existing corpus/tests/static/build, desktop and mobile viewport browser regressions, camera motion and focused physics UI/failure checks on an isolated preview. Phone performance and integrated driving remain unmeasured.
