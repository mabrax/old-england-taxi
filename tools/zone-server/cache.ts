import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCatalogue } from '../../src/lib/zone/catalogue';
import { assertZoneId } from '../zone-compiler/src/generation-request';
import { SOURCES_DIRECTORY, ZONES_DIRECTORY } from '../zone-compiler/src/zone-artifact-path';

export const CACHE_ROOT = fileURLToPath(new URL('../../.zone-cache/', import.meta.url));
export const prepared = { sourcesDirectory: SOURCES_DIRECTORY, zonesDirectory: ZONES_DIRECTORY };
export const cachedPaths = (root: string, id: string) => {
  assertZoneId(id);
  return { sourcesDirectory: join(root, 'ready', id, 'sources'), zonesDirectory: join(root, 'ready', id, 'zones') };
};
export async function readCatalogue(directory: string) {
  return parseCatalogue(JSON.parse(await readFile(join(directory, 'index.json'), 'utf8')));
}
export async function combinedCatalogue(root: string, preparedDirectory = ZONES_DIRECTORY) {
  const entries = new Map((await readCatalogue(preparedDirectory)).zones.map(entry => [entry.id, entry]));
  const directories = await readdir(join(root, 'ready'), { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const directory of directories) {
    if (!directory.isDirectory() || directory.name.startsWith('.')) continue;
    const catalogue = await readCatalogue(cachedPaths(root, directory.name).zonesDirectory);
    for (const entry of catalogue.zones) {
      if (entry.id !== directory.name) throw new Error('Cached zone identity mismatch');
      if (!entries.has(entry.id)) entries.set(entry.id, entry);
    }
  }
  return { schemaVersion: 1 as const, zones: [...entries.values()].sort((a, b) => a.id < b.id ? -1 : 1) };
}
export async function directoryBytes(path: string): Promise<number> {
  const entries = await readdir(path, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  let bytes = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) bytes += await directoryBytes(join(path, entry.name));
    else if (entry.isFile()) bytes += (await stat(join(path, entry.name))).size;
  }
  return bytes;
}
