# Phase 04 — Building volumes

## Goal

Turn supported building footprints into simple, aligned 3D volumes.

## Deliverable

A deterministic building mesh for each supported footprint, using source heights when available and a defined fallback otherwise.

## Success criteria

- Building footprints remain in their source positions after conversion to local coordinates.
- Known usable heights are applied consistently.
- Missing or unusable heights use one deterministic fallback rule.
- Extruded meshes are valid renderable geometry and do not introduce avoidable gaps or offsets at the footprint boundary.
- The fixed zone renders its building volumes together with the road surfaces.

## Exit condition

Each supported building footprint produces a stable 3D volume whose base aligns with the source footprint and whose height is explainable from source data or the fallback rule.

## Out of scope

Building parts, detailed roof shapes, terrain-following bases, interiors, materials, and landmarks.
