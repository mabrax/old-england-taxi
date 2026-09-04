# Zone compiler

The zone compiler is a local Node.js and TypeScript tool. Phase 01 gives it one fixed,
checked-in OpenStreetMap source. Phase 02 converts that source into deterministic local
coordinates. Phase 03 compiles supported carriageways into a triangulated road surface and a
checked-in viewport preview; later phases will add buildings and the complete zone artifact.

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

Run the Phase 03 road compiler and verify that the checked-in preview is current:

```sh
npm run zone:roads
```

After an intentional compiler change, regenerate the road-only viewport data with:

```sh
npm run zone:roads:write
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
network to the manifest bounds. Earcut triangulates every resulting outer ring and hole. The
compiler rejects zero-length segments, invalid polygons, non-finite vertices, degenerate triangles,
empty triangulations, and triangulations whose area differs from their source polygon; triangle
winding is normalised upward for Three.js.

The generated preview contains only the indexed Phase 03 road mesh and framing metadata needed
by the existing Three.js viewport. The road compiler runs locally; it does not run in the browser.
The complete versioned geometry, navigation graph, and source metadata artifact remains Phase 05.

## Phase 03 boundary

Phase 03 does not add colliders, a street graph, vehicle behavior, building extrusion, terrain or
elevation, lane markings, traffic systems, or the complete browser-loadable zone artifact.
