# 02 — Parameterized Zone Generation

## Goal

Promote the reusable generation engine ahead of Driveability, building on the completed and hardened Zone Compiler. Deliver all five phases in one authorized implementation task.

## Phases

1. [Phase 01 — Generation contract](./phase-01-generation-contract.md)
2. [Phase 02 — Coordinate acquisition](./phase-02-coordinate-acquisition.md)
3. [Phase 03 — Compilation and catalogue](./phase-03-compilation-catalogue.md)
4. [Phase 04 — Validation and visual QA](./phase-04-validation-visual-qa.md)
5. [Phase 05 — Qualification](./phase-05-qualification.md)

## Stage success and exit

A coordinate request produces a bounded immutable OSM source, deterministic offline schema-v1 artifact, catalogue entry, explainable report and browser QA preview. Five real cells pass the same pipeline, complete tests, static checks, production build and desktop/mobile verification. No zone-specific generation code or hand-edited generated artifacts.

## Exclusions

Hosted/on-demand generation, geocoding/place-name search, polished map selection, adjacent-zone stitching, physics, routing, terrain, bridge/tunnel reconstruction, detailed landmarks and training remain later work. Unsupported features are reported.

## Completion evidence

All five phases are implemented. See [qualification and verification evidence](./qualification.md).
