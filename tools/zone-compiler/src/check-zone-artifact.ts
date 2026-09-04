import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseZoneArtifact } from '../../../src/lib/zone/zone-artifact';
import {
  compileZoneArtifact,
  DEFAULT_ZONE_ARTIFACT_PATH,
  serializeZoneArtifact
} from './zone-artifact';

const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log('Usage: npm run zone:artifact [-- --write]');
  process.exitCode = 0;
} else if (args.some((argument) => argument !== '--write')) {
  console.error('Expected only the optional --write flag.');
  process.exitCode = 1;
} else {
  try {
    const firstSerialised = serializeZoneArtifact(await compileZoneArtifact());
    const secondSerialised = serializeZoneArtifact(await compileZoneArtifact());
    if (firstSerialised !== secondSerialised) {
      throw new Error('Repeated zone artifact compilation was not byte-stable');
    }

    const writeArtifact = args.includes('--write');
    if (writeArtifact) {
      await mkdir(dirname(DEFAULT_ZONE_ARTIFACT_PATH), { recursive: true });
      const temporaryPath = `${DEFAULT_ZONE_ARTIFACT_PATH}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryPath, firstSerialised, { encoding: 'utf8', flag: 'wx' });
        await rename(temporaryPath, DEFAULT_ZONE_ARTIFACT_PATH);
      } finally {
        await rm(temporaryPath, { force: true });
      }
    } else {
      const existing = await readArtifact();
      if (existing !== firstSerialised) {
        throw new Error(
          'The checked-in zone artifact is stale; run npm run zone:artifact:write'
        );
      }
    }

    const prepared = await readArtifact();
    const first = parseZoneArtifact(JSON.parse(prepared) as unknown);
    if (prepared !== firstSerialised) {
      throw new Error('The prepared zone artifact does not match the compiler output');
    }

    console.log(
      JSON.stringify(
        {
          status: 'ok',
          slug: first.slug,
          schemaVersion: first.schemaVersion,
          deterministic: true,
          artifact: writeArtifact ? 'written' : 'current',
          bytes: Buffer.byteLength(firstSerialised),
          sha256: createHash('sha256').update(firstSerialised).digest('hex'),
          geometry: {
            roads: first.geometry.roads.statistics,
            buildings: first.geometry.buildings.statistics
          },
          streetGraph: first.streetGraph.statistics,
          sourceSha256: first.source.snapshot.sha256
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

async function readArtifact(): Promise<string> {
  try {
    return await readFile(DEFAULT_ZONE_ARTIFACT_PATH, 'utf8');
  } catch (error) {
    throw new Error(
      'The checked-in zone artifact is missing; run npm run zone:artifact:write',
      { cause: error }
    );
  }
}
