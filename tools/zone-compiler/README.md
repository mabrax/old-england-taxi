# Zone compiler

The zone compiler is a local Node.js and TypeScript tool. Phase 01 gives it one fixed,
checked-in OpenStreetMap source. Phase 02 converts that source into deterministic local
coordinates; later phases will turn those coordinates into a browser-loadable zone artifact.

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
