# old-england-taxi

A deterministic Three.js viewport for one compiled OpenStreetMap cell around Trafalgar Square.

## Run locally

```sh
npm ci
npm run dev
```

The browser loads the checked-in zone artifact from `public/zones/`; it does not compile map data.

## Zone artifact workflow

```sh
npm run zone:artifact:write   # compile and write the prepared artifact
npm run zone:artifact         # verify the checked-in artifact is current and deterministic
npm run zone:artifact:inspect # validate and print artifact metadata and counts
```

The immutable OSM input, phase-specific compiler checks, coordinate convention, geometry rules,
artifact schema, and provenance details are documented in
[`tools/zone-compiler/README.md`](./tools/zone-compiler/README.md).

Run all project checks with:

```sh
npm run zone:check
npm run zone:coordinates
npm run zone:roads
npm run zone:buildings
npm run zone:artifact
npm test
npm run check
npm run build
```
