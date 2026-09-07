import type { GeographicBounds, ZoneSummary } from './types';
export interface AssetReference { url: string; sha256: string; }
export interface ZoneCatalogueEntry {
  id: string; label: string; bounds: GeographicBounds; summary: ZoneSummary;
  artifact: AssetReference; qa: AssetReference; report: AssetReference;
}
export interface ZoneCatalogue { schemaVersion: 1; zones: ZoneCatalogueEntry[]; }
export interface ZoneQa {
  schemaVersion: 1; id: string; sourceSha256: string; artifactSha256: string; attribution: string;
  lines: { id: string; kind: 'road' | 'building'; included: boolean; positions: number[] }[];
}
export function validZoneId(id: unknown): id is string {
  return typeof id === 'string' && id.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}
export function safeAssetUrl(url: string): string {
  // Same-origin, root-relative prepared assets. No remote fetches, credentials or traversal.
  if (typeof url !== 'string' || !/^\/[a-zA-Z0-9_./-]+\.json$/.test(url) ||
      url.startsWith('//') || url.split('/').some(part => part === '..' || part === '.')) {
    throw new Error('Prepared asset URL must be a safe same-origin JSON path');
  }
  return url;
}
export function parseCatalogue(value: unknown): ZoneCatalogue {
  const catalogue = value as ZoneCatalogue;
  if (!catalogue || catalogue.schemaVersion !== 1 || !Array.isArray(catalogue.zones) || catalogue.zones.length > 1000) throw new Error('Invalid zone catalogue');
  const ids = new Set<string>();
  for (const entry of catalogue.zones) {
    if (!entry || !validZoneId(entry.id) || ids.has(entry.id) || typeof entry.label !== 'string' || !entry.label.trim()) throw new Error('Invalid or duplicate catalogue zone');
    ids.add(entry.id);
    for (const reference of [entry.artifact, entry.qa, entry.report]) {
      if (!reference || !/^[a-f0-9]{64}$/.test(reference.sha256)) throw new Error('Invalid catalogue hash');
      safeAssetUrl(reference.url);
    }
    const b = entry.bounds;
    if (!b || ![b.south,b.west,b.north,b.east].every(Number.isFinite) || b.south < -90 || b.north > 90 || b.west < -180 || b.east > 180 || b.south >= b.north || b.west >= b.east) throw new Error('Invalid catalogue bounds');
    if (!entry.summary || ![entry.summary.buildings, entry.summary.graphEdges, entry.summary.triangles].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Invalid catalogue summary');
  }
  return catalogue;
}
export function parseZoneQa(value: unknown): ZoneQa {
  const qa = value as ZoneQa;
  if (!qa || qa.schemaVersion !== 1 || !validZoneId(qa.id) ||
      !/^[a-f0-9]{64}$/.test(qa.sourceSha256) || !/^[a-f0-9]{64}$/.test(qa.artifactSha256) ||
      typeof qa.attribution !== 'string' || !Array.isArray(qa.lines) || qa.lines.length > 200_000) throw new Error('Invalid QA data');
  for (const line of qa.lines) {
    if (!line || !/^way\/\d+$/.test(line.id) || !['road','building'].includes(line.kind) || typeof line.included !== 'boolean' ||
        !Array.isArray(line.positions) || line.positions.length < 6 || line.positions.length % 3 ||
        !line.positions.every(Number.isFinite)) throw new Error('Invalid QA line');
  }
  return qa;
}
