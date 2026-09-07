import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCatalogue, type ZoneCatalogueEntry } from '../../../src/lib/zone/catalogue';
import { assertZoneId } from './generation-request';
import { loadZoneSource } from './load-zone-source';
import { compileZoneProducts, sha256, stableJson } from './validation-report';
import { SOURCES_DIRECTORY, ZONES_DIRECTORY } from './zone-artifact-path';

export interface WorkflowOptions { sourcesDirectory?: string; zonesDirectory?: string; }
export async function listSourceIds(directory = SOURCES_DIRECTORY): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter(entry => !entry.name.startsWith('.')).map(entry => {
    assertZoneId(entry.name);
    if (!entry.isDirectory()) throw new Error(`Source ${entry.name} must be a directory`);
    return entry.name;
  }).sort();
}
export function catalogueEntry(products: ReturnType<typeof compileZoneProducts>): ZoneCatalogueEntry {
  const a = products.artifact;
  return { id: a.slug, label: a.label, bounds: a.source.bounds,
    summary: { buildings: a.geometry.buildings.statistics.buildings, graphEdges: a.streetGraph.statistics.edges,
      triangles: a.geometry.roads.statistics.triangles + a.geometry.buildings.statistics.triangles },
    artifact: { url: `/zones/${a.slug}.zone.json`, sha256: sha256(products.artifactBytes) },
    qa: { url: `/zones/${a.slug}.qa.json`, sha256: sha256(products.qaBytes) },
    report: { url: `/zones/${a.slug}.report.json`, sha256: sha256(products.reportBytes) } };
}
async function deterministicProducts(id: string, options: WorkflowOptions) {
  const first = compileZoneProducts(await loadZoneSource(id, options));
  const second = compileZoneProducts(await loadZoneSource(id, options));
  for (const key of ['artifactBytes', 'reportBytes', 'qaBytes'] as const) {
    if (first[key] !== second[key]) throw new Error(`Non-deterministic ${key} for ${id}`);
  }
  return first;
}
export async function buildZone(id: string, options: WorkflowOptions = {}) {
  assertZoneId(id);
  const directory = options.zonesDirectory ?? ZONES_DIRECTORY;
  const products = await deterministicProducts(id, options);
  const entry = catalogueEntry(products);
  await mkdir(directory, { recursive: true });
  const lock = join(directory, '.build.lock');
  await mkdir(lock); // serialize catalogue updates; no silently lost concurrent entries
  try {
    const catalogue = await readCatalogue(directory, true);
    const zones = [...catalogue.zones.filter(zone => zone.id !== id), entry].sort((a,b) => a.id < b.id ? -1 : 1);
    await atomicWrite(join(directory, `${id}.zone.json`), products.artifactBytes);
    await atomicWrite(join(directory, `${id}.qa.json`), products.qaBytes);
    await atomicWrite(join(directory, `${id}.report.json`), products.reportBytes);
    // Publish catalogue last. An interrupted multi-file update is detectable by hashes/verify.
    await atomicWrite(join(directory, 'index.json'), stableJson({ schemaVersion: 1, zones }));
  } finally { await rm(lock, { recursive: true, force: true }); }
  return { status: 'ok', id, deterministic: true, ...entry.summary, sha256: entry.artifact.sha256, warnings: products.report.warnings };
}
export async function verifyZone(id: string, options: WorkflowOptions = {}) {
  assertZoneId(id);
  const directory = options.zonesDirectory ?? ZONES_DIRECTORY;
  const products = await deterministicProducts(id, options);
  for (const [suffix, bytes] of [['zone', products.artifactBytes], ['qa', products.qaBytes], ['report', products.reportBytes]]) {
    if (await readFile(join(directory, `${id}.${suffix}.json`), 'utf8') !== bytes) {
      throw new Error(`Stale ${suffix} for ${id}; run zone:build -- ${id}`);
    }
  }
  const catalogue = await readCatalogue(directory);
  if (stableJson(catalogue.zones.find(zone => zone.id === id)) !== stableJson(catalogueEntry(products))) {
    throw new Error(`Stale catalogue entry for ${id}`);
  }
  return { status: 'ok', id, deterministic: true, sourceSha256: products.artifact.source.snapshot.sha256,
    artifactSha256: sha256(products.artifactBytes), statistics: products.report.statistics };
}
export async function verifyAll(options: WorkflowOptions = {}) {
  const ids = await listSourceIds(options.sourcesDirectory);
  const directory = options.zonesDirectory ?? ZONES_DIRECTORY;
  const catalogue = await readCatalogue(directory);
  if (JSON.stringify(catalogue.zones.map(zone => zone.id)) !== JSON.stringify(ids)) throw new Error('Catalogue/source inventory mismatch or unsorted catalogue');
  const expectedFiles = new Set(['index.json', ...ids.flatMap(id => ['zone','qa','report'].map(suffix => `${id}.${suffix}.json`))]);
  for (const file of await readdir(directory)) {
    if (!file.startsWith('.') && !expectedFiles.has(file)) throw new Error(`Uncatalogued zone asset: ${file}`);
  }
  if (await readFile(join(directory, 'index.json'), 'utf8') !== stableJson(catalogue)) throw new Error('Catalogue bytes are not canonical');
  const results = [];
  for (const id of ids) results.push(await verifyZone(id, options));
  return results;
}
export async function inspectZone(id: string, options: WorkflowOptions = {}) {
  await verifyZone(id, options);
  return JSON.parse(await readFile(join(options.zonesDirectory ?? ZONES_DIRECTORY, `${id}.report.json`), 'utf8')) as unknown;
}
async function readCatalogue(directory: string, allowMissing = false) {
  try { return parseCatalogue(JSON.parse(await readFile(join(directory, 'index.json'), 'utf8'))); }
  catch (error) {
    if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 1 as const, zones: [] };
    throw error;
  }
}
export async function atomicWrite(path: string, bytes: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}
