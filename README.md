# old-england-taxi

Generate a small 3D OpenStreetMap cell from a place name or coordinates, then inspect its roads, buildings and source outlines in Three.js.

## Run locally

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. In **Build somewhere new**, search for a place and select a result, or choose **Coordinates** and enter latitude/longitude. Choose a cell size and click **Build this location**. Progress follows download, compilation and verification; the finished zone opens automatically. You can cancel a running job or reload the page to reconnect to it.

The local Node service downloads OSM data through Overpass and compiles it in a separate process. Place search uses the public [Photon API](https://github.com/komoot/photon); it runs only on explicit submission, is throttled, and caches results for 30 days. Coordinates work independently of place search. Set `ZONE_GEOCODER_URL` before starting Vite to use another HTTPS Photon-compatible provider.

New zones persist in the ignored `.zone-cache/ready/` directory and appear alongside the five checked-in examples. Repeating an identical coordinate/cell request verifies and reuses its immutable snapshot; changing its display label does not acquire a new snapshot. Partial or failed builds are never listed. Stop the server before deleting an unwanted cache entry to reacquire newer data.

Generation supports 500 m–2 km square cells in the UI (100 m–2 km rectangular cells through the CLI). The entire cell must stay between 75°S and 75°N and may not cross the antimeridian. Usable road and building data are required; unsupported geometry or unavailable providers can prevent generation. The current renderer uses flat terrain and approximate building heights where tags are missing. It does not reconstruct bridges, tunnels or building parts, or qualify driving routes.

The service is for localhost development/preview. A static-only deployment can show prepared files but cannot generate zones. To test a production build locally:

```sh
npm run build
npm run preview:start
```

Open `http://127.0.0.1:4175`. This launcher returns once the generation API is ready and leaves preview running independently of the launching terminal. Repeating it reuses the running service. Logs and process details are in `.zone-cache/preview.log` and `.zone-cache/preview-process.json`. For a foreground process, use `npm run preview -- --host 127.0.0.1 --port 4175 --strictPort` instead. Restart the preview after changing server code.

If the server becomes unreachable, the loaded map stays visible and the generation form offers **Reconnect**. Restore the server, then reconnect to resume a known job or retry your search with the entered location preserved. Reconnecting does not submit a new search or build automatically.

## Physical world inspection

Each validated zone also initializes a paused Rapier world. **Collision surfaces** shows the ground, complete building mesh and four boundary walls independently of source outlines or generated-geometry visibility. **Resume physics** runs the fixed-step static world; **Pause physics** stops it. Leaving the tab/window pauses it and returning requires an explicit resume. There is no vehicle yet, and READY still refers to artifact/render readiness. A physics failure leaves geometry inspection available.

Amber lines mark a simulation rectangle inset 1 m from the clipped-road mesh's X/Z bounds. It is not an exact acquisition-cell boundary, a legal route, or a claim that off-road land/water is traversable. Flat ground is at y=0; the road's 4 cm rendering lift adds no collider or kerb. Building occupancy checks preserve courtyards. See [Physical world decisions and evidence](./plans/driveability/phase-01-physical-world.md) for the boundary, clearance contract, measured costs and later vehicle requirements.

```sh
npm run physics:measure -- /tmp/physical-world-measurements.json
npm run physics:browser -- http://127.0.0.1:4186
```

The browser check expects a production preview on the supplied port. For an isolated check, build and run `npm run preview -- --host 127.0.0.1 --port 4186 --strictPort` in another terminal. Measurements use a small test probe, not a vehicle or phone performance test.

## Compiler and verification

```sh
npm run zone:create -- --lat 52.2053 --lon 0.1198 --width 700 --height 700 --label "Cambridge centre"
npm run zone:verify   # verify the checked-in corpus offline
npm run verify       # corpus verification, tests, static checks and production build
npm run zone:browser # prepared-corpus browser checks against port 4175
npm run zone:live-browser # opt-in live search/build and browser recovery checks
npm run zone:rendering -- 'http://127.0.0.1:4175/?zone=YOUR_ZONE_ID' .zone-cache/rendering-qa
```

The rendering check records orbit, low-angle, zoom, pan, overhead, far and reset views as PNG frames and a WebM camera sweep. It verifies that each camera input changes the captured frame and checks browser errors. Inspect the frames for visual artifacts; page readiness alone cannot establish rendering quality.

See the [compiler documentation](./tools/zone-compiler/README.md) for CLI commands, immutable source snapshots, geometry policies, reports and provenance. The [on-demand generation notes](./plans/on-demand-generation.md) describe the local service, limits and verification evidence. Earlier compiler and parameterized-generation qualification records remain in [plans](./plans/README.md).
