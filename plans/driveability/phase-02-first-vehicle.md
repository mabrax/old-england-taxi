# Phase 02 — First vehicle

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
