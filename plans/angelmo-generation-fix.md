# Angelmó generation failure

The user's 1 km request for Angelmó, Puerto Montt (`-41.4855523, -72.9632455`) stopped during road union. The browser retained Tokyo, while the worker's `Unable to find segment #4032 … in SweepLine tree` error appeared below the form. It was a failed build, not a loading or camera problem.

Three overlapping capsules at Pasaje Frei / Avenida Pacheco Altamirano reproduce the failure. Multiplying an integer by the 0.001 m input precision can encode a coordinate as `-373.35200000000003` instead of `-373.352`; these tiny differences upset polygon-clipping's sweep-line ordering. The reduced OSM-derived fixture records the source ways and attribution in `tests/fixtures/angelmo-road-junction.json`.

The compiler retains the existing successful union/intersection path. Only known sweep-line/ring-completion errors retry with canonical three-decimal input coordinates. The retry uses the same millimetre grid, source bounds, road branches and validation rules. It does not shrink the requested cell, discard geometry or skip triangulation checks. All five prepared artifacts still verify unchanged, and the new junction regression checks branch retention, connectivity, surface area, upward Float32 triangles and repeated/permuted-input determinism.

Generation now also displays a status card over the viewport. Failures name the attempted location, provide a readable explanation, and explicitly identify the previously loaded scene. Technical details remain expandable in the form. Dismissing the card restores the scene selector and QA controls. Server job transitions now log the job ID, zone ID, state and elapsed time, with the original error on failure.

## Verification — 2026-09-07

- Reproduced the user's exact error against a retained 356,413-byte live snapshot before changing the compiler.
- Built and verified the full 1 km cell offline after the fix, then clicked **Build this location** in the user's original browser tab. A fresh acquisition completed and navigated automatically from Tokyo to Angelmó.
- User-visible result: **399 buildings, 399 graph edges, 8,157 triangles**; zone `cell-c62a84969ac9d8ab6cb0d7e4ed014c0ad82c2a4414909c0628cfb8263729d6c2`.
- Live source SHA-256: `a43f0921ef31b82463f524bbcd1bfaf7b94bb1e9c9f9976ba39ff70be9b6c475`; artifact SHA-256: `d35a8aae3a8256d7a0c92ce983f2f9164e2fa98a63696f61625e5b22ce256eb7`. The runtime report confirms deterministic output.
- A separate localhost fixture served the production UI with an intentionally failing queue runner. The new failure card was visible at 1280 × 577 and 390 × 844, named Angelmó and the retained Tokyo scene, and had no horizontal overflow. Dismiss restored the selector. No browser exceptions were reported. Screenshots: `/tmp/angelmo-failure-desktop.png`, `/tmp/angelmo-failure-mobile.png`.
- `npm run verify` passes: **147 tests**, offline corpus verification, zero static errors/warnings, and production build. The pre-existing bundle-size advisory remains (578.53 kB / 154.36 kB gzip).
