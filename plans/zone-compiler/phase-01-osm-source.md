# Phase 01 — Fixed OSM source

## Goal

Define one small, fixed geographic input that can be compiled repeatedly without depending on live map data.

## Deliverable

A versioned OSM snapshot and a minimal zone manifest identifying the zone slug, selected area, and source details.

## Implementation plan

1. Select one approximately 1 km² cell and capture its road and building source objects as native OSM JSON through a read-only Overpass query.
2. Store the immutable snapshot beside a versioned manifest containing its slug, bounds, provenance, licence, byte length, and SHA-256 checksum.
3. Add a local Node.js and TypeScript loader that validates the manifest, checksum, OSM element structure, and reference completeness without using the network.
4. Expose one inspection command and cover the checked-in source, deterministic loading, working-directory independence, and invalid input with Vitest.
5. Run source inspection, tests, type checks, and the existing application build to verify the phase boundary and exit condition.

## Technical decisions

- Use Overpass JSON because it preserves the OSM node/way/relation model and can be parsed without a new data-format library.
- Use `tsx` to execute the TypeScript compiler tool across the Node.js versions supported by the existing Vite toolchain.
- Use only Node.js built-ins for filesystem access and SHA-256 validation. Geometry libraries remain deferred until their owning phases.

## Success criteria

- A single zone slug and a bounded area of roughly 1 km² are defined.
- The OSM snapshot is stored with the project and is the compiler's input for this zone.
- The manifest records enough source information to identify the snapshot and its selected bounds.
- Re-running the compiler against the same checked-in snapshot does not require a network request.

## Exit condition

From a fresh checkout, the compiler can locate and load the same OSM input and manifest every time.

## Out of scope

Coordinate projection, road meshing, building extrusion, live area selection, and browser integration.
