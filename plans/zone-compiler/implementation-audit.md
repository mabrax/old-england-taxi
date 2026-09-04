# Phase 01–05 implementation audit and improvements

Audited on 2026-09-04, starting at `e79fbd0` (`feat: package deterministic zone artifact`).
Scope: the five completed phase plans, source manifest/snapshot, compiler modules, artifact
contract and generated JSON, browser loader and scene integration, tests, and all verification
commands. No subsequent simulator stage was started.

## Evidence and changes

The baseline passed all 47 tests and artifact freshness/determinism checks. Those checks did not
cover several failures reproduced during this audit:

| Area | Evidence at the starting commit | Implemented response |
| --- | --- | --- |
| Phase 01 source | Byte/hash and reference validation were sound, but a checksum-correct Overpass error `remark` was ignored; tag dictionaries could lose special property names. Timestamp validation differed between source and artifact. | Reject partial responses; preserve all tag names; share strict UTC/calendar validation. Add independent duplicate-ID, unsafe-ID, missing-reference, date, and remark fixtures with correct checksums. |
| Phase 02 coordinates | All 17,484 nodes and 4,111 ways preserve IDs, order, axes, ground plane, and WGS84 distances within the existing 5 cm tolerance. | Keep the transform and exact building/graph coordinates. Validate source bounds against the artifact origin and reject mismatched local/source building bounds. |
| Phase 03 roads | A distant supported way aborted the entire compilation. All 1,690 segments were buffered, including 104 that cannot reach the cell. **After Float32 conversion, the prepared road mesh contained 2 collapsed triangles and 16 with reversed winding.** | Filter width-expanded segment envelopes before buffering; retain boundary pavement even when its centerline is outside. Convert union rings to GPU precision before triangulation and remove consecutive coincident vertices. Keep the graph's centerline-intersection rule. |
| Phase 04 buildings | A footprint with the sequence `(5,10) → (5,15) → (5,10)` passed extrusion, creating overlapping walls. Area checks alone did not establish simple-ring topology. Member assembly depended on source order and repeatedly searched/spliced the remaining fragments. | Validate simple boundaries, containment, and disjoint volumes before Earcut; reject ambiguous/duplicate fragments with feature IDs. Index fragment endpoints and sort source/member IDs. Assign holes to the smallest containing outer, including an island's courtyard. |
| Phase 05 artifact/graph | A repeated-vertex road triangle passed runtime validation. Graph endpoints/counts were checked, but adjacent segments could disagree on continuity or per-way properties. Numeric arrays were copied during canonicalization, and mesh merging spread large arrays as function arguments. | Validate stored and Float32 triangle area/winding, ground planes, graph continuity, per-way consistency, dates and metadata ranges. Serialize primitive arrays without cloning and merge meshes with bounded appends. |
| Writer and commands | Freshness correctly compared repeated compilations, but writes could expose partial JSON. Verification required manually remembering separate commands. | Atomic temporary-file/rename writes, fewer simultaneously retained artifact objects, `zone:verify` and complete `verify` commands. |
| Browser integration | Fetch/body reads had no deadline or unmount cancellation. Svelte retained the full artifact for its slug. The sidebar hard-coded 45,201 triangles, which became stale on regeneration. | Abortable loads with a 30-second deadline covering body consumption; release artifact state after creating the scene; derive sidebar/HUD counts from validated data. Errors disable reset and show no loaded counts. |

Earcut assumes valid rings and does not guarantee correct geometry for arbitrary self-intersections;
its deviation value compares areas, not topology. This supports checking boundaries before using
the triangulator. See the [Earcut documentation](https://github.com/mapbox/earcut#robustness).

## Compatibility and artifact migration

Schema versions remain **1** and the fixed slug, origin, source checksum, width rules, height
rules, undirected graph semantics, and static artifact path are preserved. Regenerate the artifact
together with the stronger validator; the earlier fixed mesh fails the new GPU integrity checks.

The regenerated artifact is `public/zones/trafalgar-square-london.zone.json`, SHA-256
`3636dcb2c69face98dea581333c9309ed5c021364a0b953074b1a98c19e2fc6a`.

- Roads: 475 features; 1,582 graph segments; 11 polygons with 79 holes; **6,399 vertices and
  6,535 triangles**, down from 6,401 and 6,537. No collapsed or downward triangles remain after
  Float32 conversion. Maximum original-ring coordinate displacement is 0.000021407 m, with a
  total surface-area change of −0.001617 m².
- Buildings: all **1,005 volumes**, **48 holes**, and **38,664 triangles** remain. Comparing
  original and improved compilation by source identity and ring-node sets confirms the exact
  footprint coordinates and heights are unchanged. Deterministic member traversal changes some
  ring/footprint ordering and cap tessellation.
- Graph: the complete graph is unchanged, including **1,513 nodes**, **1,582 edges**, **11
  components**, and **20,418.613502 m** total length. Geometric crossings with separate OSM IDs
  remain disconnected. Boundary-only pavement does not invent an in-zone graph edge.
- Payload: 3,860,067 → **3,977,485 bytes** (+3.0%); default Node gzip: 632,046 → **659,083 bytes**
  (+4.3%). Exact Float32 road numbers take longer decimal representations in schema-1 JSON.

## Performance measurements

Local Linux, Node **26.8.1**, `npm ci` with the unchanged lockfile: Earcut 3.2.3,
polygon-clipping 0.15.7, Three.js 0.179.1, Vite 7.3.6, Vitest 3.2.7, tsx 4.23.13.
Baseline and improved compilers ran sequentially in separate processes against the same snapshot
and dependency installation. Each process compiled and serialized six times with `--expose-gc`
and GC before each run; the first run was discarded for the medians below. Peak RSS includes all
six runs. Measurements are observational, not CI thresholds.

| Measure | Baseline | Improved |
| --- | ---: | ---: |
| Warm median compile, including validation | 325.0 ms | 331.6 ms |
| Warm median serialization, including validation | 26.5 ms | 24.0 ms |
| Process peak RSS | 311,612 KiB | 310,392 KiB |
| Buffered segments | 1,690 | 1,586 |

The stronger validation costs time; removing unnecessary buffering and copying keeps overall
performance similar on this cell. The small RSS difference is not evidence of a meaningful
memory reduction. The large-mesh regression also combines more than 200,000 position scalars
without depending on JavaScript's function-argument limit.

## Verification evidence

- `npm ci` completed; **`npm run verify` passed**: source, coordinates, roads, buildings,
  artifact freshness/determinism and inspection; **84 tests across 7 files**; Svelte/TypeScript
  static checks with **0 errors and 0 warnings**; production build.
- Artifact write followed by freshness verification confirms repeatable prepared bytes. Source
  loading and compiler tests remain offline and independent of the working directory. New
  permutation tests cover road feature ordering and multipolygon element/member ordering without
  mutating input.
- Browser verification used agent-browser 0.36.0 with Chromium against the production preview
  on `127.0.0.1:4175`: **1440×900 desktop** and **390×844 iPhone 12 emulation at DPR 3**.
  Both reached `ready`, rendered one canvas with 6,535 road and 38,664 building triangles, showed
  the correct artifact counts, and had no horizontal overflow or console/page errors.
- Desktop orbit and reset returned to the overview; mobile reset was usable. An intercepted
  incompatible artifact produced the visible `Zone unavailable` error, zero canvases, disabled
  reset, and no loaded counts. Removing the interception restored successful loading. Tests
  separately cover network/HTTP/JSON failures, cancellation before/during fetch, response-body
  timeout, and timer/listener cleanup.
- The production bundle contains the runtime validator/loader and Three.js, while source data,
  projection, polygon clipping, Earcut, and extrusion stay outside the browser import graph.
  Vite still emits its existing advisory for a JavaScript chunk above 500 kB; final chunk size
  is about 553 kB (145 kB gzip).

## Explicit limits

This remains a compiler for one flat, fixed cell. Roads and graph edges are not a route or
driveability model. Footprints stay un-clipped and source positions are not repaired or snapped.
Unsupported building parts/relations and road classes retain the documented phase rules.

Touching rings, duplicate members, and ambiguous fragment junctions fail explicitly. Some touching
inner rings are valid OSM conventions; supporting them would require a separate boundary-merging
policy that preserves source provenance. This implementation deliberately supports separated
simple rings and nested islands, rather than silently changing those boundaries. See the
[OSM multipolygon documentation](https://wiki.openstreetmap.org/wiki/Relation:multipolygon#Touching_inner_rings).
Ring intersection checking uses envelope pruning but remains quadratic for pathological shapes.
The loader's deadline is a network/body deadline, not preemption of synchronous JSON validation.
No new physics, routing, terrain, live selection, landmarks, or training work is included.
