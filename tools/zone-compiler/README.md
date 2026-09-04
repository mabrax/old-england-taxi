# Zone compiler

The zone compiler is a local Node.js and TypeScript tool. Phase 01 gives it one fixed,
checked-in OpenStreetMap source. Phase 02 converts that source into deterministic local
coordinates. Phase 03 compiles supported carriageways into a triangulated road surface, Phase 04
extrudes supported building footprints, and Phase 05 packages both with navigation and provenance
data into one browser-loadable artifact.

## Phase 01 technology

- **Acquisition:** one manual, read-only Overpass API request.
- **Snapshot format:** native Overpass JSON, preserving OSM nodes, ways, relations, tags, and
  reference topology.
- **Runtime:** TypeScript executed with `tsx`.
- **Loading and integrity:** Node.js `fs` and `crypto`; no network access and no geographic
  transformation.
- **Verification:** the existing Vitest suite plus the `zone:check` command.

XML would require an additional parser, PBF would require binary tooling, and GeoJSON would
discard or reinterpret source topology before the compiler needs it. Those formats are therefore
not used for this small fixed cell.

## Fixed source

```text
sources/
  trafalgar-square-london/
    manifest.json
    source.osm.json
```

The first zone is a 1.00015 km² cell centred on Trafalgar Square in London. Its manifest records
the exact bounds, Overpass query, OSM database timestamp, licence details, byte length, and
SHA-256 checksum.

Run the source check from the repository root:

```sh
npm run zone:check
```

The command resolves the source relative to the compiler module, not the current working
directory. It reads only local files, validates the manifest and OSM structure, verifies every
OSM reference, and rejects any checksum mismatch.

Overpass responses containing a `remark` are rejected even with matching checksums: partial
query results are not a usable snapshot. Source and artifact timestamps share the same calendar
validation, including optional milliseconds; impossible dates cannot silently roll into another
month. OSM tag names are preserved as own properties, including names such as `constructor`.

The snapshot is intentionally not refreshed by compiler runs. Replacing it is a deliberate source
update: execute the recorded query, replace the file, and update the timestamp, byte length, and
checksum together.

OpenStreetMap data is available under the ODbL. Attribution: © OpenStreetMap contributors.

## Local coordinates

Run the Phase 02 coordinate inspection from the repository root:

```sh
npm run zone:coordinates
```

Like the source check, the underlying compiler resolves the checked-in source relative to its own
module rather than the process working directory.

The transform uses the exact midpoint of the manifest bounds as its one origin. Input positions
use WGS84 geographic coordinates (`EPSG:4326`) with explicit latitude and longitude fields. Each
point is converted to an Earth-centred WGS84 position, offset from the origin, and rotated onto the
origin's east/north tangent plane. Output is in metres with this right-handed Three.js convention:

| Axis | Direction |
| --- | --- |
| `+x` | east |
| `+y` | up |
| `+z` | south (`-z` is north) |

OSM provides no elevation in this snapshot, so Phase 02 deliberately flattens every point to
`y = 0`; terrain remains deferred. All OSM nodes become point features. Every OSM way with at
least two resolved node references becomes a line feature whose source order, identifier, node
references, closed/open state, and tags are preserved. OSM relations do not contain coordinates
themselves and stay in the loaded source as topology for the later phase that interprets them.

The in-memory result retains the source bounds and a complete coordinate-system record: schema,
source CRS, projection method, units, origin, axes, handedness, and ground plane. Tests compare
local horizontal distances with independent WGS84 geodesic calculations using a maximum error of
0.05 metres across the fixed source.

## Phase 02 boundary

Phase 02 does not infer road widths, generate surfaces, extrude buildings, construct a street
graph, emit a zone artifact, or load geographic data in the browser.

## Road surfaces

Run the Phase 03 road compiler check:

```sh
npm run zone:roads
```

Supported centerlines are `motorway`, `trunk`, `primary`, `secondary`, `tertiary`, their link
classes, `unclassified`, `residential`, `living_street`, `service`, and `road`. Highway ways tagged
as areas are excluded because they are not centerlines. Physical access restrictions do not
remove a road surface.

Widths use this fixed precedence:

1. A finite `width` value from 1 through 50 metres, optionally suffixed with metre units.
2. A whole `lanes` value from 1 through 12 multiplied by 3.2 metres.
3. The highway-class fallback below.

| Highway class | Fallback width |
| --- | ---: |
| `motorway`, `trunk` | 12.8 m |
| `motorway_link`, `trunk_link` | 6.4 m |
| `primary` | 9.6 m |
| `primary_link`, `secondary_link`, `tertiary_link`, `living_street` | 4.8 m |
| `secondary` | 8.0 m |
| `tertiary` | 6.4 m |
| `unclassified`, `residential`, `road` | 5.5 m |
| `service` | 3.5 m |

Each segment is buffered as a 12-sided round-ended capsule after millimetre input rounding.
Polygon Clipping unions all overlaps, including connected intersections, before clipping the
network to the manifest bounds. Segments whose width-expanded bounding boxes cannot reach the
zone are discarded before buffering; the margin includes rounding precision. A supported way
entirely outside the cell no longer aborts a compile. Pavement just outside the centerline bounds
can still enter the surface, while graph selection remains based on centerline intersection.
`zone:roads` reports buffered segments and skipped outside segments/ways.

Before Earcut triangulates the resulting outer rings and holes, their coordinates are converted
to Float32 and consecutive coincident points are removed. This is the precision used by Three.js
vertex buffers; triangulating higher precision coordinates first can reverse or collapse thin
triangles during GPU upload. The artifact stores those exact Float32 values as JSON numbers. The
compiler rejects zero-length segments, invalid polygons, non-finite vertices, degenerate triangles,
empty triangulations, and triangulations whose area differs from their source polygon; triangle
winding is normalised upward for Three.js.

The road compiler runs locally; Phase 05 packages its indexed mesh into the complete artifact.

## Phase 03 boundary

Phase 03 does not add colliders, a street graph, vehicle behavior, building extrusion, terrain or
elevation, lane markings, traffic systems, or the complete browser-loadable zone artifact.

## Building volumes

Run the Phase 04 building compiler check:

```sh
npm run zone:buildings
```

Supported footprints are closed ways with a non-`no` `building` tag and building multipolygon
relations made entirely from outer and inner way members. Relation member ways are assembled by
their shared OSM node references using an endpoint index and are not emitted again as standalone
buildings. Ways, relations, and member ways are processed in ascending source ID order, so OSM
element/member array order does not choose the resulting mesh order. Phase 02 still preserves
source order and way direction. Any feature
with a `building:part` tag is excluded because parts belong to a later fidelity stage. Footprint
rings retain their source node IDs and exact Phase 02 horizontal positions; they are not clipped,
simplified, snapped, or offset.

Heights use this fixed precedence:

1. A finite `height` from 0.5 through 1,000 metres. Unitless and explicit metre values are metres;
   `ft`, `foot`, and `feet` values are converted to metres.
2. A finite `building:levels` from 0.5 through 200 multiplied by 3 metres.
3. The single 12 metre fallback.

Earcut triangulates each footprint's roof and floor while preserving courtyard holes. Every outer
and inner ring also emits closed wall quads using the exact footprint boundary at `y = 0` and the
inferred height. The compiler rejects non-finite positions, zero-length edges, non-positive areas,
degenerate triangles, bad indices, excessive triangulation deviation, and cap/footprint area
mismatches.

Ring topology is validated before triangulation: repeated boundary points, backtracking edges,
self-intersections, overlapping outer volumes, and crossing, nested, or outside holes fail with
OSM feature context. Courtyards belong to the smallest containing outer ring, supporting islands
inside courtyards with their own holes. Duplicate relation members and ambiguous/dangling fragment
endpoints also fail explicitly. Touching rings, including the touching-inner-ring convention
permitted by OSM, are deliberately rejected by this compiler subset; it does not silently repair
or reshape footprints. Simple ring edge checks prune by bounding boxes, but pathological rings
can still require quadratic intersection work.

The building compiler runs locally; Phase 05 combines its per-building meshes into the complete
artifact.

## Phase 04 boundary

Phase 04 does not add building parts, detailed roofs, interiors, terrain or elevation, landmarks,
colliders, vehicles, a street graph, or the complete browser-loadable zone artifact.

## Zone artifact

Phase 05 emits exactly one prepared file for the fixed zone:

```text
public/
  zones/
    trafalgar-square-london.zone.json
```

From the repository root, use this workflow:

```sh
# Compile from the checked-in OSM snapshot and write the artifact.
npm run zone:artifact:write

# Recompile in memory and fail if the checked-in bytes are stale.
npm run zone:artifact

# Validate and summarize the prepared artifact without running geometry compilers.
npm run zone:artifact:inspect
```

The schema is version `1` and is defined by `src/lib/zone/types.ts` plus the dependency-free
runtime validator in `src/lib/zone/zone-artifact.ts`. The artifact contains:

- the complete indexed road and building triangle meshes, their bounds, and auditable counts;
- an undirected street graph with one edge for every road centerline segment selected by the road
  compiler's fixed-bounds intersection rule;
- the WGS84 origin, local metre axes, ground plane, geographic bounds, and combined local bounds;
- the source snapshot identity, checksum, timestamp, acquisition request, attribution, and licence;
- the exact Phase 01–04 schema versions and the road/building compilation rules needed to explain
  the output.

Graph nodes use OSM node IDs and exact Phase 02 local positions. Graph edges identify their OSM
way and zero-based source segment, highway class, inferred width, and length. The graph is
topological data only: direction, traffic policy, route selection, and driveability stay deferred.

Serialization recursively orders object keys, preserves array order, uses compact JSON, and ends
with one newline. Primitive geometry arrays are serialized without a second full array copy.
Mesh merging appends values without spreading arbitrarily large arrays into function arguments.
The write/check command compiles twice, validates both results, compares their bytes, and validates
the file after writing. Writes use a temporary file and a rename in the same directory so readers
cannot see a partially written artifact. Compilation reads only local files and never refreshes
the OSM source.

The Vite application fetches `/zones/trafalgar-square-london.zone.json` as a static resource,
validates it, and only then builds the existing Three.js scene. A missing, malformed, incompatible,
or structurally invalid artifact produces a visible viewport error. Runtime validation checks
triangle area and road winding at both stored and GPU precision, ground planes, geographic bounds
and origin agreement, and consecutive graph-segment continuity and consistent per-way properties.
Requests have a 30-second deadline covering the response body, and unmounting cancels the request.
Only summary counts and the slug remain in Svelte state after scene construction. Sidebar and HUD
counts come from the validated artifact; unavailable data is not presented as loaded. No source loader, projection,
buffering, polygon union, triangulation, or building extrusion code is imported by the browser.
Keeping geometry outside the JavaScript bundle also lets the artifact remain independently
cacheable and inspectable.

## Complete verification

```sh
npm ci
npm run zone:verify # source, coordinates, roads, buildings, freshness, inspection
npm run verify     # those checks plus Vitest, svelte-check, and the production build
```

Use the committed lockfile for reproducibility. Compiler measurements, fixed-zone migration
details, remaining limits, and desktop/mobile browser evidence are recorded in
[`implementation-audit.md`](../../plans/zone-compiler/implementation-audit.md).
