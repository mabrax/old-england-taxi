import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseZoneArtifact } from '../../../src/lib/zone/zone-artifact';
import { DEFAULT_ZONE_ARTIFACT_PATH } from './zone-artifact-path';

const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log('Usage: npm run zone:artifact:inspect -- [artifact-path]');
  process.exitCode = 0;
} else if (args.length > 1) {
  console.error('Expected zero or one artifact path.');
  process.exitCode = 1;
} else {
  try {
    const artifactPath = args[0] === undefined
      ? DEFAULT_ZONE_ARTIFACT_PATH
      : resolve(args[0]);
    const raw = await readFile(artifactPath, 'utf8');
    const artifact = parseZoneArtifact(JSON.parse(raw) as unknown);

    console.log(
      JSON.stringify(
        {
          status: 'ok',
          artifactPath,
          schemaVersion: artifact.schemaVersion,
          slug: artifact.slug,
          bytes: Buffer.byteLength(raw),
          sha256: createHash('sha256').update(raw).digest('hex'),
          source: {
            dataset: artifact.source.provenance.dataset,
            osmBaseTimestamp: artifact.source.snapshot.osmBaseTimestamp,
            snapshotSha256: artifact.source.snapshot.sha256
          },
          coordinates: {
            units: artifact.coordinates.system.units,
            axes: artifact.coordinates.system.axes,
            origin: artifact.coordinates.system.origin,
            localBounds: artifact.coordinates.localBounds
          },
          geometry: {
            roads: artifact.geometry.roads.statistics,
            buildings: artifact.geometry.buildings.statistics
          },
          streetGraph: artifact.streetGraph.statistics
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
