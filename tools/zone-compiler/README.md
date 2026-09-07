# Local zone generation

The developer workflow converts an explicit coordinate cell into prepared static assets. Acquisition
is the only network step. Compilation, inspection and verification read immutable local sources and
resolve paths relative to the modules, regardless of cwd. The browser only loads prepared JSON.

## Commands

```sh
npm ci
npm run zone:request -- --lat 52.2053 --lon 0.1198 --width 700 --height 700 --label 'Cambridge centre'
npm run zone:acquire -- --lat 52.2053 --lon 0.1198 --width 700 --height 700 --label 'Cambridge centre'
npm run zone:build -- <zone-id>
npm run zone:inspect -- <zone-id>
npm run zone:verify -- <zone-id>
npm run verify
```

`zone:create` accepts the same coordinate arguments and performs acquire then build. `zone:request`
has no side effects. Coordinates are required; width and height each default to 1000 metres. No ID
on build/inspect/component commands means every local source; no ID on verify also checks the full
source/catalogue/asset inventory. `zone:check`, `zone:coordinates`, `zone:roads`, `zone:buildings`,
`zone:artifact`, `zone:artifact:write` and `zone:artifact:inspect` remain generic aliases. The full
`verify` path checks every prepared product, tests, Svelte/TypeScript and the production build.

Outside the repository, call the absolute path to `node_modules/.bin/tsx` with the absolute path to
`tools/zone-compiler/src/run.ts` and the same subcommands. Build, inspection and verification never use the network.
`create` and `acquire` intentionally do.

Programmatic entry points: `createZoneRequest(input)`, `acquireZone(input, options)`,
`buildZone(id, options)`, `inspectZone(id, options)`, `verifyZone(id, options)`, `verifyAll(options)`.
Tests can inject source/output directories and an acquisition fetch implementation. The strict
low-level projection, road, building and schema-v1 compiler APIs remain available.

## Contract and acquisition

- Version 1 accepts 100–2000 metres per side, with the entire cell strictly between −75° and +75°
  latitude and inside ±180° longitude. Polar and antimeridian cells fail before I/O.
- Bounds use WGS84 meridional/parallel curvature at the center. Dimensions describe the local
  tangent plane, not a geodesic polygon or terrain surface. No rounding of request coordinates
  is hidden in identity. The full SHA-256 of version, normalized latitude/longitude and dimensions
  produces `cell-<hash>`; a label never becomes a path or changes identity. Unsafe IDs, traversal
  and source/snapshot symlinks fail. The legacy Trafalgar source keeps its original ID and bytes.
- Overpass receives one read-only POST query with a 60-second server timeout and 64 MiB memory
  budget; client deadline is 90 seconds and decompressed response limit 20 MiB/200,000 elements.
  There are no automatic retries. JSON, status, body length, error remarks, timestamps, duplicate
  IDs and every reference are validated. A named User-Agent is sent for endpoint compatibility.
- The exact response bytes, query, endpoint, acquisition and OSM timestamps, byte length, SHA-256,
  attribution and ODbL licence are stored together under `sources/<id>/`. Full downward recursion
  preserves member topology; bounding-box selection cannot discover every crossing with no node
  in the query, and recursive members can extend outside it.
- A temporary directory is validated through the offline loader and renamed atomically. An
  exclusive per-ID lock prevents competing acquisition writers. Existing snapshots are validated
  and reused without fetching; conflicting labels fail. Refreshing sources is an explicit future
  workflow, never a side effect of compilation. A process crash can leave a hidden staging/lock
  directory; inspect and remove it only after confirming no writer is running.

## Compilation and prepared products

The existing pipeline is preserved: OSM → WGS84 local east/up/south metres → width-inferred,
12-sided round road buffers → intersection union and boundary clipping → Float32-safe road
triangulation → building footprints/holes and extrusions → undirected OSM street graph → validated
schema-v1 artifact. Width uses valid `width`, then `lanes × 3.2 m`, then highway-class defaults.
Building height uses valid `height`, then `building:levels × 3 m`, then 12 m. No terrain is inferred.

The strict building API still rejects invalid topology. Generation explicitly selects
`invalidFeaturePolicy: 'report'`: a building with unsupported topology is excluded as a whole with its precise OSM
ID/reason, and relation member outlines are suppressed rather than rendered as partial duplicates.
Only typed unsupported-topology errors are recoverable; mesh, projection, unexpected exceptions and cross-component/schema invariants still fail. Unsupported classes,
parts and relation forms are excluded and explained. Cells without usable roads/buildings cannot
produce schema-v1's required nonempty meshes and fail with an actionable error; water-only/rural
empty-zone support is not claimed.

A build compares two independent complete compilations before writing:

| Product | Purpose |
| --- | --- |
| `public/zones/<id>.zone.json` | Existing schema-v1 mesh, graph, coordinate metadata and provenance |
| `public/zones/<id>.report.json` | Feature decisions/reasons, unsupported tags, boundary policy, counts, width/height sources, hashes and warnings |
| `public/zones/<id>.qa.json` | Source-derived highway and footprint/member polylines before buffering/extrusion, with inclusion status and source/artifact hashes |
| `public/zones/index.json` | Sorted IDs, labels, bounds, summary counts and artifact/report/QA URLs and hashes |

Each file uses a temporary-file rename. Catalogue updates have an exclusive output lock and publish
last. This is atomic per file, not a multi-file transaction: a crash during a rebuild may temporarily
leave mismatched asset/catalogue hashes, which the browser and verification reject; rebuilding the
same ID repairs it. Rebuilding one zone never writes another zone's files. No compilation timestamps
enter generated products. `zone:verify` checks repeated bytes, source integrity, every saved product,
canonical sorted catalogue, and missing/extra assets.

## Browser QA

The default preview selects the first sorted catalogue entry. The developer selector navigates by
ID; `?zone=<id>&qa=1` enables source comparison. `?artifact=/zones/<id>.zone.json&qa=1` loads a
same-origin root-relative URL with sibling QA/report assets. Both selectors together, unsafe URLs,
missing IDs, invalid schemas and hash mismatches fail visibly. Loading has abort/unmount handling
and a 30-second deadline for each asset fetch/body. Compiler modules, source OSM, Earcut and polygon
clipping never enter the browser import graph.

Toggle source outlines and generated geometry independently. Cyan denotes included road centerlines,
magenta included footprint/member outlines, and orange excluded source features. Lines render above
the mesh for comparison; their horizontal coordinates remain source-derived. This is a QA overlay,
not a claim that excluded geometry exists in the artifact. The report identifies source feature IDs.
READY means the prepared data validated and rendered, not physical/geographic fidelity.

All emitted geometry is flat. Bridges, tunnels, layers, building parts and raised bases are explicitly
reported. Roads are clipped; complete building footprints and selected graph segments can extend
outside the cell. Graph crossings only connect through shared OSM nodes. There is no routing,
physics, geocoding, hosted generation, map search, stitching, layer reconstruction or training.

See [qualification evidence](../../plans/parameterized-zone-generation/qualification.md) and the
[completed compiler audit](../../plans/zone-compiler/implementation-audit.md). Overpass query syntax
and its resource settings follow the [official OSM reference](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL).
All real source-derived data: © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).

Run `npm run preview -- --host 127.0.0.1 --port 4175`, then `npm run zone:browser` for the repeatable desktop/mobile QA checks. Browser SHA-256 validation requires localhost or HTTPS.
