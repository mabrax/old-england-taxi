# 01 — Zone Compiler

## Goal

Turn one fixed real-world cell into a deterministic 3D zone artifact.

## Scope

- Select one predefined area of roughly 1 km² and save its OSM snapshot.
- Convert geographic coordinates into local metre-based coordinates.
- Reconstruct road surfaces through width inference, buffering, intersection union, and triangulation.
- Extrude building footprints using known or deterministic fallback heights.
- Produce renderable geometry plus street graph and source metadata.

## Exit condition

The same input always produces the same zone. Roads are continuous, buildings align with their footprints, and the zone renders smoothly in the Phase 00 viewport.

## Deferred

Vehicle physics, live area selection, terrain, detailed landmarks, and training features.
