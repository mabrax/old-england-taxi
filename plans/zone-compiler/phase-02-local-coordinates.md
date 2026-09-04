# Phase 02 — Local coordinates

## Goal

Convert the fixed snapshot's geographic coordinates into a stable local coordinate system measured in metres.

## Deliverable

A documented coordinate transform with the origin and orientation retained in the zone metadata.

## Success criteria

- Every supported point and line feature can be transformed from geographic coordinates into local metre coordinates.
- The transform uses one explicit origin and axis convention for the complete zone.
- Repeated transforms of the same input produce the same coordinates.
- Basic distance and orientation checks confirm that the local representation preserves the source layout within the agreed tolerance.

## Exit condition

The fixed snapshot can be represented in local coordinates without ambiguous axes, missing origins, or non-finite values.

## Out of scope

Road width inference, surface generation, building heights, street-graph construction, and live projection changes.
