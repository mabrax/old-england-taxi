# Parameterized Zone Generation — qualification

Completed 2026-09-07 UTC (2026-09-06 in America/Santiago), from hardened compiler commit
`71a4dc4`. Stage 02 is promoted ahead of Driveability; its five briefs describe the delivered
contract, acquisition, catalogue, validation/QA and qualification work. Later stages retain map
selection/geocoding, caching, adjacency, hosted-generation decisions, physics, fidelity and training.

## Real cells and evidence

Four new snapshots were acquired with the coordinate CLI from Overpass. The existing Trafalgar
snapshot remains the exact regression source: its bounds are legacy values rather than a newly
rounded coordinate request. No generated artifact or snapshot was hand-edited, and no compiler
branch refers to any of these cities or feature IDs. Fixture assertions may name their evidence.

| Cell | Center latitude, longitude | Width × height (m) | Roads / graph edges | Buildings / courtyards | Road + building triangles |
| --- | --- | --- | --- | --- | --- |
| Chicago River North grid | 41.891000, -87.634000 | 600 × 600 | 271 / 805 | 226 / 0 | 3407 + 6720 |
| Cambridge centre | 52.205300, 0.119800 | 700 × 700 | 122 / 372 | 614 / 8 | 1744 + 29156 |
| London Tower Bridge | 51.505500, -0.075400 | 750 × 750 | 171 / 457 | 262 / 0 | 2055 + 11500 |
| Lucca historic centre | 43.843000, 10.504000 | 700 × 700 | 147 / 366 | 1325 / 27 | 1800 + 33372 |
| Trafalgar Square, London | 51.508030, -0.128100 | ~1000 × 1000 (legacy) | 475 / 1582 | 1005 / 48 | 6535 + 38664 |

Cambridge provides a familiar compact British urban layout with college courts, predominantly flat
street context, and extensive footways intentionally excluded from carriageway generation. Chicago
River North provides a regular grid with different street widths and building heights. Lucca supplies
an irregular historic layout and 27 courtyard holes; this corpus qualifies courtyards rather than
claiming a real OSM roundabout fixture. Tower Bridge deliberately tests unsupported crossings,
layers and complex building parts. These are morphology fixtures, not measured terrain truth.

The new cells use 600–750 m dimensions to keep raw OSM and prepared geometry reviewable. Trafalgar
retains the roughly 1 km² regression. All five source/manifest and artifact/report/QA/catalogue files
total **24,254,591 bytes** uncompressed (about **4,197,653 bytes** when individually gzip-compressed).
Raw Overpass JSON preserves exact response bytes and reference topology; compact generated JSON
avoids pretty-print overhead. Reports retain every non-node source feature decision and QA retains
unmodified horizontal source coordinates, trading some size for independently inspectable evidence.
The corpus is deliberately small, not a global correctness claim.

## Known unsupported evidence

- Chicago `relation/9522023`: rings 0 and 1 intersect or touch.
- Tower Bridge `relation/6974419`: rings 0 and 3 intersect or touch.

Both are excluded as whole buildings under the explicit generation policy, including their member
outlines. The low-level building API still rejects them. Their precise reasons appear in the report;
only typed unsupported-topology errors are recoverable; mesh and component failures still abort. Valid meshes retain the existing triangulation and runtime integrity checks. Tests assert the
Chicago rejection/exclusion/member suppression independently of the generated JSON.

Tower Bridge's snapshot contains **29 bridge-tagged**, **40 tunnel-tagged**, **74 nonzero-layer**
features and **368 building-part** features. Warning counts include excluded source features as
well as included ones; each feature's road/building decision clarifies whether it was rendered.
`zone-qualification.test.ts` independently counts these tags from every real source and checks all
corresponding report IDs/reasons, not merely a hardcoded report total.

All cells report boundary data outside the requested box. Roads are clipped, while full building
footprints and graph segments can extend outside; source overlays expose those differences. Overpass
node-based bbox selection can miss a crossing with no source node in the box. No adjacent stitching,
terrain, grade separation, routing or physical driving fidelity is claimed. Schema-v1 requires
nonempty supported roads and buildings; empty/water-only cells fail explicitly. Acquisition caps and
geographic limits intentionally bound this workflow rather than suggesting global coverage.

## Immutable identities and hashes

Each entry below links the exact query, timestamps, licence and source checksum, and its generated
validation evidence. Catalogue URLs and all product hashes are also verified from source.

- **Chicago River North grid** — `cell-865afa942cecf07997117878c0868f89804cfe35c85fa6d5e1f4a87bf7d51410`. [Manifest](../../tools/zone-compiler/sources/cell-865afa942cecf07997117878c0868f89804cfe35c85fa6d5e1f4a87bf7d51410/manifest.json), [report](../../public/zones/cell-865afa942cecf07997117878c0868f89804cfe35c85fa6d5e1f4a87bf7d51410.report.json).
  Source SHA-256 `055d488fccf0a1dc1915d40982590f718200c5883a05ef8f9625027ee7de29b7`; artifact SHA-256 `4a9037e4db68a6cd55cd3db90a0aa50988b550ca1f3cd7d68125d4a35f6473b6`.
- **Cambridge centre** — `cell-976969d235a150cda1f36084fb9559d8777e9d64004ebe3228780286831eaa43`. [Manifest](../../tools/zone-compiler/sources/cell-976969d235a150cda1f36084fb9559d8777e9d64004ebe3228780286831eaa43/manifest.json), [report](../../public/zones/cell-976969d235a150cda1f36084fb9559d8777e9d64004ebe3228780286831eaa43.report.json).
  Source SHA-256 `fffc7bfa5a2f737baf7230fbd13905e99d5aa03e2206f2bc4785c9e378211647`; artifact SHA-256 `6dea8e06c7a3f40ac306b07236dcbd3779ba8cf4e87caaa3e490069217760cd4`.
- **London Tower Bridge** — `cell-bc662dbb6af4d9776e6f0949104133900761f4c6cd0f4fdd567041c1cb06996a`. [Manifest](../../tools/zone-compiler/sources/cell-bc662dbb6af4d9776e6f0949104133900761f4c6cd0f4fdd567041c1cb06996a/manifest.json), [report](../../public/zones/cell-bc662dbb6af4d9776e6f0949104133900761f4c6cd0f4fdd567041c1cb06996a.report.json).
  Source SHA-256 `13759df362152b8c74cafc199cadc22d731a63ca7466c81c3925f801de50da3d`; artifact SHA-256 `5f4887e391bafe1ded5e82519e42ceaaed35998655810b61b1f4019571cfb00d`.
- **Lucca historic centre** — `cell-d815e08a99cee7a31b46d4e3ddddfd889fb0ea011c1261f06fc2b2b3360ecf87`. [Manifest](../../tools/zone-compiler/sources/cell-d815e08a99cee7a31b46d4e3ddddfd889fb0ea011c1261f06fc2b2b3360ecf87/manifest.json), [report](../../public/zones/cell-d815e08a99cee7a31b46d4e3ddddfd889fb0ea011c1261f06fc2b2b3360ecf87.report.json).
  Source SHA-256 `b53365cd47469391b4bc62e042bd8b7a88968048da3415df209d81a49f9eb5c3`; artifact SHA-256 `8eff07f47eba43f30f5084232c0f4bfd086f6cc740660ad9435f6493c044e3cf`.
- **Trafalgar Square, London** — `trafalgar-square-london`. [Manifest](../../tools/zone-compiler/sources/trafalgar-square-london/manifest.json), [report](../../public/zones/trafalgar-square-london.report.json).
  Source SHA-256 `a56dce2329fdc5f1130d300839251119f6261bb08216c0b70363aa646b423484`; artifact SHA-256 `3636dcb2c69face98dea581333c9309ed5c021364a0b953074b1a98c19e2fc6a`.

Trafalgar's schema-v1 artifact remains byte-identical to the hardened baseline, SHA-256
`3636dcb2c69face98dea581333c9309ed5c021364a0b953074b1a98c19e2fc6a`.

## Verification

- `npm ci`: passed, 94 packages installed; package audit reported zero vulnerabilities.
- Coordinate → acquisition → offline build happy paths: four real cells. Initial Overpass HTTP 406
  responses left no partial source. Explicit client headers (User-Agent and permissive Accept) resolved endpoint compatibility.
  Chicago's first strict compile exposed the unsupported topology above; no published partial
  artifact was retained. Re-running create reused the immutable source without a network refresh.
- `npm run zone:check`, `zone:coordinates`, `zone:roads`, `zone:buildings`: passed for all five.
- `npm run verify`: all five source/artifact/report/QA/catalogue checks passed, **135 tests across
  10 files passed**, Svelte/TypeScript **0 errors / 0 warnings**, production build passed.
- Independent builds compare artifact, report and QA bytes twice. Tests compile from another cwd
  with network disabled, prove rebuild isolation, validate unsafe coordinates/paths, exercise
  malformed/partial/network/oversized/hanging acquisition and cleanup, immutable reuse, source
  identity/symlink rejection, catalogue selection/integrity, cancellation and source QA provenance.
- Absolute-path CLI `verify` executed from `/tmp`: all five zones passed.
- `git diff --check`: passed. Browser imports remain restricted to runtime validation/loading and
  Three.js; no source acquisition, projection, Earcut, polygon clipping or extrusion enters them.
- Production JavaScript: **565.62 kB**, **149.73 kB gzip**. Vite retains its >500 kB chunk advisory.

Browser checks run against `npm run preview -- --host 127.0.0.1 --port 4175` with
`npm run zone:browser` (agent-browser 0.36.0, Chrome 152.0.7977.82). The [recorded browser results](./browser-verification.json) include all ten passing cell/viewport combinations and the three verified failures. The script starts an isolated
browser session and stores screenshots/results in a printed temporary directory. Desktop is
1440 × 900; mobile is iPhone 12 emulation, 390 × 844 at DPR 3. Both sizes exercise every cell,
READY states, matching triangle counts, one canvas, QA toggles, reset, no horizontal overflow and
no console/page errors. It also exercises catalogue selection, missing IDs, intercepted artifact
schema failure, stale QA hash failure, and successful explicit-URL recovery. The initial test route
was narrowed to asset paths because a wildcard also matched the page's artifact URL query; this
was a test interception issue rather than an application loader failure.

Atomicity is per file for generated assets, with the catalogue published last under an exclusive
writer lock. An interrupted rebuild can expose mismatched hashes, which fail visibly until the
same ID is rebuilt. Snapshot publication is a single directory rename containing both validated
files. Process crashes may require manual removal of inspected, inactive hidden lock/staging files.
Browser hashing uses Web Crypto, so serve from localhost or HTTPS.
