# Phase 02 — First vehicle

**Status: complete (2026-09-07), ready for parent review.** [Verification](./phase-02-verification.md), [motion/contact measurements](./phase-02-measurements.json) and [browser evidence](./phase-02-browser-verification.json) record the declared Phase 02 exit. Phase 03/04 remain unstarted. Authorized Phase 02 work started from reviewed Phase 01 `76c8063`, on isolated `codex/driveability-first-vehicle`; canonical main and prepared bytes stay untouched.

## Goal

Make one generic vehicle move and recover reliably in the Phase 01 world.

## Deliverable

A simple visible vehicle with a dynamic chassis, Rapier ray-cast wheel controller, repeatable command input, generic safe spawn, and vehicle reset. Record its dimensions, mass/suspension, axis conventions, speed limits, and handling acceptance envelope.

## Success criteria

- Acceleration, steering, coasting, braking to rest, and reverse work through one input contract. Chassis collision and wheel support agree with rendered poses; repeatable checks use the agreed timestep, speed limits, and numerical tolerances.
- A bounded spawn search validates actual road support, complete chassis/wheel/suspension clearance, building occupancy and overhead geometry, room to move, and the play boundary. Graph edges and widths are candidate hints only. The same artifact/configuration chooses the same eligible start without per-city coordinates or exceptions.
- If no safe candidate exists, driving stays unavailable with an explanation and inspection remains usable. A rejected candidate is never made usable by moving/removing source geometry or disabling collision.
- At rest and during representative head-on, glancing, corner, and maximum-supported-speed contacts, the vehicle does not fall through ground or pass through included walls beyond the agreed tolerance. Collision-detection settings are justified by these results; ray-cast wheels alone are not chassis collision proof.
- Ordinary off-road movement remains free within the boundary. The agreed limit stops departure, while an escaped/fallen or invalid state has bounded recovery. A stuck or overturned vehicle can be reset to a revalidated start without reloading the cell.
- Reset clears velocity, active forces/input, wheel/controller state, and simulation/render interpolation so it cannot reapply a held throttle or stale motion. Repeated reset and different render cadences do not change the intended handling envelope.

## Exit condition

One selected prepared cell demonstrates supported driving, building contact, off-road return, and repeatable recovery through the input contract. A contrasting prepared cell uses the same spawn and vehicle rules; safety/ineligibility checks cover obstructed, narrow, and out-of-bound candidates before UI work begins.

## Out of scope

Final keyboard/touch layout, chase-camera polish, multiple vehicle types, calibrated automotive dynamics, damage, routes, traffic rules, and hand-authored per-zone spawn data.

## Dependency and planning agreement

Depends on the verified [Physical world](./phase-01-physical-world.md) exit. Follow the [stage working agreement](./README.md#working-agreement): discuss and detail the implementation plan when this phase is ready. Input exercises here may use a minimal development harness; [Phase 03](./phase-03-driving-interaction.md) owns the user-facing interaction. The compiler graph remains unchanged.

## Implementation plan (2026-09-07)

1. Extend the existing scene-owned physics session with one vehicle lifetime, preserving lazy initialization, failure cleanup, paused start, 60 Hz/five-step catch-up and focus/visibility behavior. Order each step as command/suspension update, world integration, recovery/snapshot. Dispose the controller before its body/world.
2. Use the installed pinned Rapier 0.20.0 declarations and [official vehicle API](https://rapier.rs/javascript3d/classes/DynamicRayCastVehicleController.html). Build a 2.0 × 0.9 × 4.4 m, 1,100 kg cuboid chassis with CCD and four ray-cast wheels; retain all rotations. Start with 8 m/s forward and 3 m/s reverse limits. Record final suspension, forces, braking and contact tolerances with measured evidence.
3. Keep one normalized signed-throttle/steering/brake contract. Brake overrides engine force; opposing throttle brakes before reversing. A reset/pause clears input and requires neutral before accepting a new command, so held controls cannot restart motion. A bounded button-driven development exercise uses this same contract, without final keyboard/touch controls or a chase camera.
4. Search no more than 256 repeatable graph-hint candidates. Validate the entire oriented chassis/wheels/full suspension envelope, conservative building/headroom AABB, actual pavement triangle-union coverage, a 6 m forward/3 m reverse launch corridor and 10 m extra boundary margin. Reject unsupported/narrow/obstructed areas with an inspection-preserving explanation. No city IDs or runtime coordinate overrides.
5. Render a simple visible taxi, synchronize chassis quaternion and wheel steering/spin/suspension using fixed-step snapshots and interpolation. Recast wheel support at the post-step pose so visuals do not use a pre-step world point. Keep static collider inspection independent from the dynamic chassis and retain orbit/QA/camera reset.
6. Reset revalidates the original start and replaces only the vehicle body/controller to clear all cached contact/wheel state, forces and velocities; snap interpolation and reset the session clock. Allow driven off-road return, explicit overturned/stuck reset, and bounded nonfinite/escaped/fallen recovery with a contact-tolerant envelope.
7. Add actual-vehicle motion/contact, spawn/ineligibility and lifecycle/cadence tests. Record selected/contrasting prepared-cell motion plus controlled rare-case fixtures. Run offline corpus, full tests, static/build and relevant browser regressions on an unused isolated port; preserve historical evidence. Commit and hand off to the parent for review. Phase 03/04, prepared regeneration, push/deploy and canonical integration remain outside this task.
