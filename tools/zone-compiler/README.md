# Zone compiler

The zone compiler is a local Node.js and TypeScript tool. Phase 01 gives it one fixed,
checked-in OpenStreetMap source; later phases will transform that source into a browser-loadable
zone artifact.

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

## Phase boundary

Phase 01 does not project coordinates, generate road or building geometry, emit a zone artifact,
or load geographic data in the browser.
