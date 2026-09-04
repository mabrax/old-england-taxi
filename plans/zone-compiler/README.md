# 01 — Zone Compiler

## Goal

Turn one fixed real-world cell into a deterministic 3D zone artifact.

## Phases

The stage is split into five sequential phases. Each phase has a narrow deliverable and a local exit condition. Detailed implementation tasks are defined only when that phase begins.

1. [Phase 01 — Fixed OSM source](./phase-01-osm-source.md)
2. [Phase 02 — Local coordinates](./phase-02-local-coordinates.md)
3. [Phase 03 — Road surfaces](./phase-03-road-surfaces.md)
4. [Phase 04 — Building volumes](./phase-04-building-volumes.md)
5. [Phase 05 — Zone artifact](./phase-05-zone-artifact.md)

## Stage success criteria

The zone compiler stage succeeds when all five phase deliverables are complete:

- One predefined area of roughly 1 km² has a saved, reproducible OSM snapshot.
- Geographic coordinates are converted into documented local metre-based coordinates.
- Road surfaces are reconstructed through width inference, buffering, intersection union, and triangulation.
- Building footprints are extruded using known or deterministic fallback heights.
- Renderable geometry, a street graph, and source metadata are emitted as one browser-loadable zone artifact.

## Exit condition

The same input always produces the same zone. Roads are continuous, buildings align with their footprints, and the zone renders smoothly in the Phase 00 viewport.

## Deferred

Vehicle physics, live area selection, terrain, detailed landmarks, and training features.

## Working agreement

When a phase is ready to build, we first agree on that phase's implementation plan. A phase is complete only after its success criteria and exit condition have been verified; then we move to the next phase.
