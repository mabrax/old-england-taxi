# 03 — Zone Generalization

## Goal

Apply the proven compiler to more than one geographic cell.

## Scope

- Parameterize generation by a stable zone ID or bounding box.
- Verify adjacent zones and continuity at their boundaries.
- Add a simple map-based area selector.
- Cache generated artifacts and expose clear loading and failure states.
- Decide whether new zones are generated locally, on demand, or from a prepared catalogue.

## Exit condition

Several different urban zones can be selected, generated, loaded, and driven without zone-specific code.
