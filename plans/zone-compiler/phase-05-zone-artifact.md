# Phase 05 — Zone artifact

## Goal

Package the generated geometry and navigation data into one deterministic artifact that the browser can load.

## Deliverable

A versioned zone artifact containing renderable geometry, the street graph, coordinate metadata, and source metadata.

## Success criteria

- One compiler run emits all geometry needed to render the fixed zone.
- The artifact includes a street graph that corresponds to the compiled road network.
- The artifact includes the coordinate transform and source metadata needed to interpret it.
- Serialization is stable, so the same snapshot and configuration produce the same artifact content.
- The Phase 00 application can load the artifact and render the fixed zone without compiler code running in the browser.

## Exit condition

The fixed zone can be compiled, loaded, and rendered end to end from the checked-in snapshot, with deterministic output and no missing geometry or metadata required by the client.

## Out of scope

Vehicle physics, route selection, dynamic generation, terrain, detailed landmarks, and training-session features.
