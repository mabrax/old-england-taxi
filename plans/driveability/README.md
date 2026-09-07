# 03 — Driveability

See the [rollout roadmap](../README.md) for stage order and dependencies.

## Goal

Drive one vehicle inside one bounded, flat generated cell, with reliable ground and building collision, understandable controls, and recovery from mistakes.

## Platform scope

The application is web-only, including use in an iPad browser. Desktop, touch, tablet, and mobile checks in this stage refer to the browser application; native iOS/iPadOS or other native apps are excluded. Phase 03 will name the intended browser/device targets for interaction, and Phase 04 will record their browser versions, operating systems, hardware, and measured performance. Viewport emulation alone does not establish iPad browser compatibility or performance.

This platform requirement leaves the existing localhost generation architecture in place. Prepared-zone driving remains independent of the generation service; exposing or hosting that service is a separate decision.

## Starting point

This proposal is based on `712fe6f`, matching local `main` on 2026-09-07 and including its 11 commits beyond `origin/main`. The [Zone Compiler](../zone-compiler/README.md), [Parameterized Zone Generation](../parameterized-zone-generation/README.md), and [local on-demand extension](../on-demand-generation.md) are delivered. Their qualification records establish deterministic schema-v1 geometry, five prepared cells, acquisition/catalogue/report/QA, and browser place/coordinate generation through a bounded localhost service and separate worker. They do not establish physical driveability.

At that baseline, the [scene](../../src/lib/scene/validation-scene.ts) rendered geometry with OrbitControls and owned its animation loop and disposal. The [viewport](../../src/lib/scene/SceneViewport.svelte) loaded a validated artifact, handled cancellation/errors, and selected another zone through navigation. There was no vehicle, simulation, or Rapier dependency. Phase 01 now adds the runtime-owned physical world; its brief records implementation decisions and verification. Phase 02 now adds one visible ray-cast vehicle, bounded generic safe spawn, a command harness, reset/recovery and physical evidence. Phase 03 now adds production keyboard/touch interaction and a chase camera; its verification record distinguishes available Chromium evidence from outstanding device checks. Phase 04 has completed its available-environment qualification work and is ready for independent review; its [record](./phase-04-verification.md) preserves failed results and outstanding device acceptance.

## Phases

Four sequential phases follow the [Zone Compiler working agreement](../zone-compiler/README.md#working-agreement). Each delivers a verifiable boundary; later briefs remain lean until their phase is ready.

1. [Phase 01 — Physical world](./phase-01-physical-world.md) — complete; [verification](./phase-01-verification.md)
2. [Phase 02 — First vehicle](./phase-02-first-vehicle.md) — complete; [verification](./phase-02-verification.md)
3. [Phase 03 — Driving interaction](./phase-03-driving-interaction.md) — implemented and independently reviewed; [verification and remaining device evidence](./phase-03-verification.md)
4. [Phase 04 — Qualification](./phase-04-qualification.md) — available-environment record ready for review; full acceptance open; [record](./phase-04-verification.md), [remaining-device procedure](./phase-04-device-procedure.md)

## Bounded scope

- One active cell, one simple vehicle, flat ground, and collision against included building geometry. Use the same runtime rules for prepared and locally generated schema-v1 artifacts; a valid artifact may still lack a safe driving start.
- Acceleration, steering, braking, reverse, keyboard and touch input, a chase camera, and an explicit vehicle reset. The vehicle can leave the pavement and return by driving within the play boundary, without a session restart or automatic road snapping.
- A marked simulation boundary with bounded recovery, plus lifecycle handling for loading, pause/resume, focus loss, reset, zone replacement, and disposal.
- Preserve geometry inspection, source QA, attribution, and the existing local generation flow. Proposed interaction: enter driving explicitly after simulation readiness; inspect mode pauses driving. A newly selected/generated cell starts a fresh paused/inspection state with neutral input.

## Architecture and constraints

**Keep schema-v1 and the compiler/runtime boundary.** The [artifact contract](../../src/lib/zone/types.ts) already supplies metre-based east/up/south coordinates, indexed road/building meshes, provenance, and an undirected graph. Physics and transient driving state belong in the runtime; Svelte owns UI/state and Three.js renders simulation poses. OSM acquisition and geometry compilation stay in the local tool/worker. Reports and QA remain evidence, not an alternative collision source or a prerequisite for driving.

**Retain Rapier 3D and its ray-cast vehicle controller.** The official [vehicle API](https://rapier.rs/javascript3d/classes/DynamicRayCastVehicleController.html) provides wheel suspension, steering, engine force, and braking on a chassis. This supports the existing direction; it does not establish suitable handling or wall collision by itself. Phase 01 settles package/WASM initialization and world ownership; Phase 02 defines the dynamic chassis, coordinate conventions, tuning, and operating limits. No dependency is installed by this plan.

**Separate physical surfaces from rendering offsets.** The artifact ground is `y = 0`; the scene lifts roads by 4 cm and applies depth bias for visibility. These are presentation choices, not kerbs or an additional physics floor. Begin with one flat ground support model for road and off-road movement. Reconstructing terrain or preparing a terrain subsystem is unnecessary for this stage.

**Preserve concavity and courtyards.** Buildings arrive as one combined indexed mesh, without a runtime footprint list or per-building collider recipe. Static triangle-mesh collision is the initial candidate; a whole-building convex hull or bounding box can fill courtyards and passages. Rapier's [collider guide](https://rapier.rs/docs/user_guides/javascript/colliders/#triangle-meshes-and-polylines) also explains that triangle meshes have no interior for containment queries. Consequently, a non-overlap test alone cannot prove a spawn is outside a building. Phase 01 must establish collision and occupancy/clearance checks that preserve holes; Phase 02 verifies them with the complete vehicle envelope. Included walls must block the chassis within the agreed operating limits. Excluded buildings, building parts, barriers, and unmodeled passages are not reconstructed implicitly.

**Choose a real play boundary before adding the vehicle.** In [artifact packaging](../../tools/zone-compiler/src/zone-artifact.ts), `coordinates.localBounds` is the union of road/building mesh bounds, not the requested cell rectangle. Roads are clipped, while full buildings and selected graph endpoints can lie outside the source bounds. Schema-v1 retains geographic source bounds but no explicit projected clipping polygon. The proposed starting point is a conservative local play envelope derived from clipped-road geometry, visibly identified as a simulation limit; it may be smaller than the requested cell. Phase 01 must agree and verify its exact rule and vehicle clearance margin. Building/graph outliers and the renderer's ground margin must not silently enlarge it. Prefer a marked stopping boundary with reset available, plus recovery if the vehicle escapes or falls; these are artificial limits, not mapped barriers.

If exact acquisition-cell edges or reliable collision/occupancy cannot be obtained within the agreed schema-v1 approach, record the missing data and propose a bounded artifact/compiler dependency before the dependent phase proceeds. An extension needs an explicit compatibility/versioning and qualification plan; do not silently redefine existing fields, import compiler geometry into the browser, hand-edit artifacts, or rewrite the compiler.

**Use generic safe spawn and reset.** Graph positions and inferred widths can suggest candidates but cannot certify clearance or even place an endpoint inside the play area. Validate actual road support, building occupancy/overhead clearance, the chassis and wheel/suspension envelope, boundary clearance, and room for initial movement. Search must be bounded and repeatable without city IDs or stored per-cell spawn coordinates. If no candidate qualifies, retain inspection and explain why driving is unavailable. Reset returns to the validated starting pose, rechecks safety, and clears motion, controls, controller state, and camera/step interpolation; it does not reload the map or generate another zone.

**Own the simulation lifecycle.** Use fixed physics steps, bounded catch-up, and a defined render synchronization policy. Physics initialization must not revive a disposed scene or leave partial resources behind. Pause/visibility changes and UI focus release driving input; resuming must not apply a backlog of elapsed wall time. Keep camera reset distinct from vehicle reset. Only one world/vehicle/render loop may be active; replacement and unmount release physics, input, camera, renderer, and asynchronous work. Simulation failure must have a clear state distinct from artifact validity; existing `READY` is not a driving certificate.

## What physical qualification means

Replace the old promise to traverse every connected street with observed vehicle behavior in declared test areas and operating limits. [Existing corpus evidence](../parameterized-zone-generation/qualification.md) and [road tests](../../tests/road-surfaces.test.ts) show why graph connectivity cannot supply that promise: the graph is undirected, omits one-way/access/turn rules, and connects only shared OSM nodes even where flattened road meshes cross. Widths are inferred, bridges/tunnels/layers are flattened, and roads can overlap included buildings or terminate at a clip boundary. Unsupported building topology is deliberately excluded.

The flat ground also does not represent water, real barriers, or the suitability of open land for driving. Physical movement across these omissions is a model limitation. This stage qualifies collision, handling, input, camera, and recovery for the generated representation. It does not qualify legal routes, all streets, real-world clearance, or geographic fidelity.

## Stage success criteria

- A generic runtime creates and disposes a bounded physical world from schema-v1 without changing compiler outputs or coupling driving to the generation service.
- One vehicle starts safely, accelerates, steers, brakes, reverses, and remains supported by flat ground. Included building walls and the play limit block it under the agreed speed, timestep, and collision tolerances; courtyard voids remain open.
- Keyboard and touch complete the same driving/recovery actions. The chase camera keeps driving understandable around buildings and after reversing/reset; inspection remains usable.
- Off-road departures inside the boundary allow a driven return. Collision, stuck/overturned states, escaped/fallen states, and unavailable spawn have safe, explained outcomes.
- The five checked-in cells are assessed individually with the same runtime and parameters. At least two contrasting cells demonstrate normal driving; every remaining case has passing applicable physical checks or an explicit source/eligibility limitation. Unexpected physics failures block qualification and cannot be relabeled as map limitations.
- Phase 04 records correctness, lifecycle, desktop and iPad browser interaction, and measured performance against targets agreed before qualification. Existing compiler/loader/generation behavior remains verified. Compiler byte determinism is not a claim of bit-identical physics across browsers.

## Exit condition

All four phase deliverables and local exit conditions are verified. A recorded session demonstrates safe start, connected pavement and turns in a selected test area, building contact, off-road return, braking/reverse, boundary behavior, and reset; a contrasting cell works without special code. The qualification record names tested artifacts, device/browser and vehicle settings, measured budgets, failures/limitations, and acceptance against the agreed criteria. No current rendering or compiler audit is counted as evidence that these driving checks already pass.

## Dependencies and overlap

- Stages 01–02 and the local on-demand extension supply the completed foundation. Keep their historical completion evidence intact. New locally generated cells use the same eligibility checks; their creation does not certify driveability, and qualification must not depend on a live provider.
- Phase 01 establishes world lifecycle, collision/clearance queries, and boundary policy; Phase 02 adds vehicle and recovery; Phase 03 adds user interaction and camera; Phase 04 qualifies the integrated behavior. Each phase verifies its own risks before handoff; qualification consolidates evidence rather than postponing all checks.
- [Stage 04](../03-zone-generalization.md) owns map selection, richer cache behavior, and adjacent-cell continuity. Selecting another independent cell for testing here is not streaming or stitching. Hosted generation remains a separate architectural decision; prepared files must support driving without a generation server.
- [Stage 05](../04-geographic-fidelity.md) owns terrain, layers, building detail, and real barriers; its geometry changes will require collision and artifact compatibility review. [Stage 06](../05-training-experience.md) needs an explicit routing/legal-driving data and qualification decision before reference routes or driving-rule feedback; this stage does not add those semantics to the graph.

## Decisions for phase discussions

- **Phase 01:** accept the proposed conservative play envelope and marked stop/reset behavior, or require exact acquisition-cell edges and resolve the artifact dependency. Agree the inspection/driving transition and target browser/device combinations so world-cost measurements start early.
- **Phase 02:** agree vehicle dimensions and handling intent, maximum forward/reverse speeds, braking/reverse behavior, spawn-clearance and collision tolerances, and repeatable acceptance maneuvers. The proposal favors forgiving urban exploration rather than calibrated vehicle dynamics.
- **Phase 03:** agree desktop and iPad browser targets, touch layout and orientation behavior, chase-camera behavior near walls and in reverse, and explicit resume/reset feedback. Manual reset to the starting pose is the default; automatic recovery is reserved for an invalid/escaped physical state, not ordinary off-road travel.
- **Before Phase 04:** finalize the representative driving areas and numeric setup/frame/physics/memory budgets on the agreed browser/device combinations, informed by earlier measurements. iPad compatibility, touch usability, and performance require checks in the intended browser on representative iPad hardware. Broader hardware or arbitrary-cell guarantees need separate evidence.

## Exclusions

Routing and legal-driving qualification; traffic, pedestrians, multiple vehicles, multiplayer, training/scoring, realistic damage, and calibrated tyre/drivetrain simulation; terrain/elevation, bridge/tunnel/layer reconstruction, real-world barriers, detailed vehicle/building assets, and building interiors; adjacent-cell stitching/streaming, hosted multi-user generation, and cache-management expansion. No compiler or artifact redesign is assumed.

## Working agreement

The original proposal did not authorize implementation. The user subsequently authorized Phases 01–03 and then explicitly said “proceed with phase 04” on 2026-09-07, after being told that Phase 03 implementation passed independent review while device evidence remained open. That authorizes the detailed Phase 04 plan and reasonable engineering choices, including prospective budgets, without another general approval round. It permits qualification work to proceed despite the remaining Phase 03 device checks; it does not waive them or close the stage. Detailed plans/evidence remain in this folder. Verify the full stage exit before later-stage implementation; scope or artifact dependency changes require a new discussion.
