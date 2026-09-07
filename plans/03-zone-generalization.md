# 04 — Zone Selection and Continuity

## Goal

Build area-selection and multi-zone simulator behavior on the parameterized local engine and Driveability.

## Promoted scope

Coordinate/dimension generation, source acquisition, prepared catalogue, artifact loading/error states and multi-cell compiler qualification moved into [Stage 02](./parameterized-zone-generation/README.md). Generation is a local developer workflow producing prepared static artifacts.

## Remaining scope

- Verify adjacent zones and continuity at their boundaries; define stitching policy.
- Add a map-based area selector and place-name geocoding adapter over the coordinate contract.
- Add application caching and selection behavior beyond the developer QA catalogue selector.
- Evaluate hosted/on-demand generation only as a separate architectural decision; it is not required by Stage 02.

## Exit condition

Different and adjacent urban zones can be selected, loaded and driven with clear cache/loading/failure behavior and no zone-specific code.
