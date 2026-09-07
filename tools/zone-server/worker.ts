import { mkdir, readFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { acquireZone } from '../zone-compiler/src/acquire-zone';
import { createZoneRequest, type ZoneRequest } from '../zone-compiler/src/generation-request';
import { buildZone, verifyZone } from '../zone-compiler/src/zone-workflow';
import { cachedPaths, prepared, readCatalogue, directoryBytes } from './cache';
import type { GenerationJob, GenerationState } from '../../src/lib/zone/generation-types';

interface Work { request: ZoneRequest; workdir: string; cacheRoot: string; }
const progress = (state: GenerationState, message: string) => process.send?.({ state, message });
process.once('disconnect', () => process.exit(1));
process.once('message', (work: Work) => {
  void generate(work).then(result => {
    process.send?.({ result }, () => process.exit(0));
  }).catch((error: unknown) => {
    process.send?.({ error: error instanceof Error ? error.message : String(error) }, () => process.exit(1));
  });
});

async function generate({ request: input, workdir, cacheRoot }: Work): Promise<NonNullable<GenerationJob['result']>> {
  const request = createZoneRequest(input);
  const id = request.id;
  for (const paths of [prepared, cachedPaths(cacheRoot, id)]) {
    const exists = await stat(join(paths.zonesDirectory, `${id}.zone.json`)).catch(error => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (exists) {
      progress('verifying', 'Checking the existing zone…');
      await verifyZone(id, paths);
      return result(paths.zonesDirectory, id, true);
    }
  }
  const existing = await readCatalogue(prepared.zonesDirectory);
  // The small runtime cache is intentionally separate from the checked-in qualification corpus.
  const { combinedCatalogue } = await import('./cache');
  if ((await combinedCatalogue(cacheRoot)).zones.length - existing.zones.length >= 20) {
    throw new Error('The local cache contains 20 generated zones. Clear unused .zone-cache/ready entries before generating more.');
  }
  const paths = { sourcesDirectory: join(workdir, 'sources'), zonesDirectory: join(workdir, 'zones') };
  progress('acquiring', 'Downloading roads and buildings from OpenStreetMap…');
  await acquireZone(request, paths);
  progress('compiling', 'Building road surfaces, buildings and the street graph…');
  await buildZone(id, paths);
  progress('verifying', 'Checking geometry, source integrity and deterministic output…');
  await verifyZone(id, paths);
  const completed = await result(paths.zonesDirectory, id, false);
  const ready = join(cacheRoot, 'ready');
  if (await directoryBytes(ready) + await directoryBytes(workdir) > 512 * 1024 * 1024) {
    throw new Error('The local zone cache would exceed 512 MiB. Clear unused cached zones or use a smaller cell.');
  }
  await mkdir(ready, { recursive: true });
  await rename(workdir, join(ready, id)); // Publish source, meshes, QA and report as one directory.
  return completed;
}
async function result(directory: string, id: string, cached: boolean) {
  const entry = (await readCatalogue(directory)).zones.find(zone => zone.id === id);
  if (!entry) throw new Error('Generated zone is absent from its catalogue');
  const report = JSON.parse(await readFile(join(directory, `${id}.report.json`), 'utf8'));
  return { entry, cached, warnings: report.warnings };
}
