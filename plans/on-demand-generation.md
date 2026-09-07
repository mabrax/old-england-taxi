# On-demand location generation

The next user request expands the completed parameterized-generation stage: enter a location in the browser and build it immediately when usable source data exists. This adds a local request service and UI on top of the existing compiler. Hosted multi-user deployment, routing, terrain reconstruction and cell stitching remain separate work.

## Request flow

1. Submit a place/address to Photon and select a returned point, or enter WGS84 latitude/longitude directly. Search is explicit, not autocomplete. Provider errors leave coordinate entry available.
2. Submit coordinates and cell dimensions to `/api/zone-generation/jobs`. Coordinate validation and ID construction use the existing compiler contract; the browser cannot choose filesystem paths or compiler options.
3. A single child process acquires source, compiles and verifies. Status is available through `/jobs/:id`; `/jobs/:id/cancel` stops queued or active work. At most one job runs and four wait. Identical active requests share the same job.
4. The worker builds in `.zone-cache/work-*`. It checks source integrity, geometry and deterministic output before renaming the entire directory into `.zone-cache/ready/:id`. The runtime catalogue merges complete cached results with the prepared corpus. Checked-in files are unchanged.
5. The browser polls status and opens the completed zone through the existing hash-validated loader and QA controls. A session-stored job ID permits reload/reconnection while the local service is running. After a server restart, an expired job is explained and the form becomes usable again. Completed cache entries survive restarts.

## Operational bounds

The Vite plugin runs in both development and production preview. API requests require a localhost Host; browser writes require JSON and the app header, with same-origin checks. This is a local service, not a deployed public API. Static hosting does not include the worker.

Each worker has a 150-second total deadline and a 1 GiB Node heap limit. Existing acquisition limits remain: one bounded Overpass request, 90-second client deadline, 20 MiB source maximum and 200,000 elements. Queue history retains at most 50 jobs. The ready cache is limited to 20 generated zones and 512 MiB; search responses are capped at 256 KiB and cached for 30 days. Provider endpoints can be temporarily unavailable; the UI does not promise an instant result or fabricate coverage.

The public [Photon demo server](https://github.com/komoot/photon) permits reasonable use and may throttle traffic. The adapter requests at most five results, applies a 1.1-second interval and a 15-second deadline, and accepts `ZONE_GEOCODER_URL` for a different HTTPS Photon-compatible provider. Attribution links to OpenStreetMap. Coordinate entry needs no geocoder.

Existing supported latitude, cell-size, antimeridian and geometry constraints are unchanged. Reusing a coordinate/cell ID means reusing its original verified snapshot and label. This is on-demand generation, not a live stream of OSM changes.

## Verification

- Eleven service tests cover queue serialization/deduplication, active/queued cancellation, deadlines, failure recovery, scratch cleanup, real offline child-process verification and cancellation, Photon parsing/cache/throttling/errors/size limits, HTTP validation, local-origin guards and complete-only catalogue publication.
- Live browser search for **Shibuya Crossing, Tokyo** resolved to `35.6594951, 139.7004982`; a new 500 m cell was acquired and generated from Overpass. It loaded automatically with 426 buildings, 552 graph edges and 11,481 mesh triangles. ID: `cell-1351cbd8dbeb8b40ab1f71779a80beaf1d42b64c4e268ca5cd6ab81dbc9af618`. Source acquired 2026-09-07; runtime data remain in the ignored local cache.
- Desktop 1280 × 577 and mobile 390 × 844 render the generated geometry and place/coordinate controls without browser errors. Screenshots were visually inspected.

- Direct coordinates **-33.4372, -70.6506** (central Santiago), 500 m: newly generated 214 buildings, 141 graph edges and 12,720 triangles, ready after 3,127 ms on this run. ID: `cell-b8b841e99dcd22fe5839b37e289fce26fd9303f2500569065698fda41fe05301`. This is an observation, not a latency guarantee.
- Both new zones survived a service restart and loaded through production preview with QA sidecars. The prepared corpus remains unchanged.
- All 146 tests pass; static checks report zero errors/warnings; offline corpus verification and production build pass. The existing bundle-size advisory remains (576.43 kB JavaScript / 153.58 kB gzip).

- `npm run zone:live-browser` passed against production preview: live place-search submission, cached generation and automatic navigation, desktop/mobile rendering and QA/reset controls, invalid-coordinate recovery, real job reconnection after blocked progress requests and reload, and missing-job recovery after restart. [Machine-readable evidence](./on-demand-browser-verification.json) records the run.
