# 02 — Driveability

## Goal

Make the generated zone physically driveable.

## Scope

- Add Rapier ground, terrain-ready, building, and barrier colliders.
- Add one vehicle using the ray-cast vehicle controller.
- Support keyboard and touch input, chase camera, braking, reverse, and reset.
- Allow free movement off the intended road without restarting the session.

## Exit condition

The vehicle can traverse every connected street in the fixed zone, responds consistently, stays on the ground, and cannot pass through buildings.

## Deferred

Routes, scoring, traffic, pedestrians, and realistic vehicle damage.
