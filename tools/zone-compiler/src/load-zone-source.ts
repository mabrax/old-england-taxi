import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUtcTimestamp } from '../../../src/lib/zone/timestamp';
import {
  OSM_VERSION,
  ZONE_SOURCE_SCHEMA_VERSION,
  type GeographicBounds,
  type LoadedZoneSource,
  type OsmElement,
  type OsmElementCounts,
  type OsmRelationMember,
  type OsmSnapshot,
  type OsmTags,
  type ZoneSourceManifest
} from './types';

export const DEFAULT_ZONE_SLUG = 'trafalgar-square-london';

const DEFAULT_SOURCES_DIRECTORY = fileURLToPath(new URL('../sources/', import.meta.url));
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface LoadZoneSourceOptions {
  sourcesDirectory?: string;
}

export async function loadZoneSource(
  slug = DEFAULT_ZONE_SLUG,
  options: LoadZoneSourceOptions = {}
): Promise<LoadedZoneSource> {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid zone slug: ${slug}`);
  }

  const sourcesDirectory = options.sourcesDirectory ?? DEFAULT_SOURCES_DIRECTORY;
  const zoneDirectory = resolve(sourcesDirectory, slug);
  const manifestPath = resolve(zoneDirectory, 'manifest.json');
  const manifest = parseManifest(await readUtf8File(manifestPath, `manifest for ${slug}`));

  if (manifest.slug !== slug) {
    throw new Error(`Manifest slug ${manifest.slug} does not match requested zone ${slug}`);
  }

  if (basename(manifest.snapshot.file) !== manifest.snapshot.file) {
    throw new Error('Snapshot file must be a filename inside the zone source directory');
  }

  const snapshotPath = resolve(zoneDirectory, manifest.snapshot.file);
  const snapshotBytes = await readBinaryFile(snapshotPath, `snapshot for ${slug}`);

  if (snapshotBytes.byteLength !== manifest.snapshot.byteLength) {
    throw new Error(
      `Snapshot byte length mismatch: expected ${manifest.snapshot.byteLength}, received ${snapshotBytes.byteLength}`
    );
  }

  const checksum = createHash('sha256').update(snapshotBytes).digest('hex');
  if (checksum !== manifest.snapshot.sha256) {
    throw new Error(`Snapshot checksum mismatch: expected ${manifest.snapshot.sha256}, received ${checksum}`);
  }

  const osm = parseOsmSnapshot(snapshotBytes.toString('utf8'));
  if (osm.osm3s.timestamp_osm_base !== manifest.source.osmBaseTimestamp) {
    throw new Error(
      `OSM base timestamp mismatch: manifest has ${manifest.source.osmBaseTimestamp}, snapshot has ${osm.osm3s.timestamp_osm_base}`
    );
  }

  validateReferences(osm.elements);

  return {
    manifest,
    osm,
    counts: countElements(osm.elements),
    files: {
      manifest: manifestPath,
      snapshot: snapshotPath
    }
  };
}

async function readUtf8File(path: string, description: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read ${description} at ${path}`, { cause: error });
  }
}

async function readBinaryFile(path: string, description: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (error) {
    throw new Error(`Unable to read ${description} at ${path}`, { cause: error });
  }
}

function parseManifest(raw: string): ZoneSourceManifest {
  const value = parseJson(raw, 'zone manifest');
  const manifest = expectRecord(value, 'Zone manifest');

  if (manifest.schemaVersion !== ZONE_SOURCE_SCHEMA_VERSION) {
    throw new Error(`Unsupported zone manifest schema version: ${String(manifest.schemaVersion)}`);
  }

  expectSlug(manifest.slug, 'Zone manifest slug');
  expectString(manifest.label, 'Zone manifest label');
  const bounds = parseBounds(manifest.bounds);
  const approximateArea = expectPositiveNumber(
    manifest.approximateAreaSquareKilometres,
    'Zone manifest approximate area'
  );

  const snapshot = expectRecord(manifest.snapshot, 'Zone manifest snapshot');
  const snapshotFile = expectString(snapshot.file, 'Zone manifest snapshot file');
  if (snapshot.format !== 'overpass-json') {
    throw new Error(`Unsupported snapshot format: ${String(snapshot.format)}`);
  }
  const byteLength = expectPositiveInteger(snapshot.byteLength, 'Zone manifest snapshot byte length');
  const sha256 = expectString(snapshot.sha256, 'Zone manifest snapshot SHA-256');
  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error('Zone manifest snapshot SHA-256 must be 64 lowercase hexadecimal characters');
  }

  const source = expectRecord(manifest.source, 'Zone manifest source');
  const osmBaseTimestamp = expectIsoTimestamp(
    source.osmBaseTimestamp,
    'Zone manifest OSM base timestamp'
  );
  const request = expectRecord(source.request, 'Zone manifest source request');
  if (request.method !== 'POST') {
    throw new Error(`Unsupported source request method: ${String(request.method)}`);
  }
  const licence = expectRecord(source.licence, 'Zone manifest source licence');

  return {
    schemaVersion: ZONE_SOURCE_SCHEMA_VERSION,
    slug: manifest.slug as string,
    label: manifest.label as string,
    bounds,
    approximateAreaSquareKilometres: approximateArea,
    snapshot: {
      file: snapshotFile,
      format: 'overpass-json',
      byteLength,
      sha256
    },
    source: {
      dataset: expectString(source.dataset, 'Zone manifest source dataset'),
      api: expectString(source.api, 'Zone manifest source API'),
      endpoint: expectUrl(source.endpoint, 'Zone manifest source endpoint'),
      osmBaseTimestamp,
      request: {
        method: 'POST',
        parameter: expectString(request.parameter, 'Zone manifest source request parameter'),
        query: expectString(request.query, 'Zone manifest source request query')
      },
      attribution: expectString(source.attribution, 'Zone manifest source attribution'),
      attributionUrl: expectUrl(
        source.attributionUrl,
        'Zone manifest source attribution URL'
      ),
      licence: {
        id: expectString(licence.id, 'Zone manifest source licence ID'),
        url: expectUrl(licence.url, 'Zone manifest source licence URL')
      }
    }
  };
}

function parseBounds(value: unknown): GeographicBounds {
  const bounds = expectRecord(value, 'Zone manifest bounds');
  const parsed = {
    south: expectNumber(bounds.south, 'Zone manifest south bound'),
    west: expectNumber(bounds.west, 'Zone manifest west bound'),
    north: expectNumber(bounds.north, 'Zone manifest north bound'),
    east: expectNumber(bounds.east, 'Zone manifest east bound')
  };

  if (parsed.south < -90 || parsed.north > 90 || parsed.south >= parsed.north) {
    throw new Error('Zone manifest latitude bounds are invalid');
  }
  if (parsed.west < -180 || parsed.east > 180 || parsed.west >= parsed.east) {
    throw new Error('Zone manifest longitude bounds are invalid');
  }

  return parsed;
}

function parseOsmSnapshot(raw: string): OsmSnapshot {
  const value = parseJson(raw, 'OSM snapshot');
  const snapshot = expectRecord(value, 'OSM snapshot');
  if (snapshot.remark !== undefined) {
    throw new Error(`OSM snapshot contains an Overpass remark; partial results cannot be compiled: ${String(snapshot.remark)}`);
  }

  if (snapshot.version !== OSM_VERSION) {
    throw new Error(`Unsupported OSM version: ${String(snapshot.version)}`);
  }

  const osm3s = expectRecord(snapshot.osm3s, 'OSM snapshot osm3s metadata');
  const elements = expectArray(snapshot.elements, 'OSM snapshot elements').map(parseOsmElement);

  if (elements.length === 0) {
    throw new Error('OSM snapshot contains no elements');
  }

  return {
    version: OSM_VERSION,
    generator: expectString(snapshot.generator, 'OSM snapshot generator'),
    osm3s: {
      timestamp_osm_base: expectIsoTimestamp(
        osm3s.timestamp_osm_base,
        'OSM snapshot base timestamp'
      ),
      copyright: expectString(osm3s.copyright, 'OSM snapshot copyright')
    },
    elements
  };
}

function parseOsmElement(value: unknown, index: number): OsmElement {
  const context = `OSM element at index ${index}`;
  const element = expectRecord(value, context);
  const id = expectPositiveInteger(element.id, `${context} ID`);
  const tags = parseTags(element.tags, context);

  if (element.type === 'node') {
    const lat = expectNumber(element.lat, `${context} latitude`);
    const lon = expectNumber(element.lon, `${context} longitude`);
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new Error(`${context} has invalid coordinates`);
    }
    return tags === undefined
      ? { type: 'node', id, lat, lon }
      : { type: 'node', id, lat, lon, tags };
  }

  if (element.type === 'way') {
    const nodes = expectArray(element.nodes, `${context} node references`).map((node, nodeIndex) =>
      expectPositiveInteger(node, `${context} node reference at index ${nodeIndex}`)
    );
    return tags === undefined ? { type: 'way', id, nodes } : { type: 'way', id, nodes, tags };
  }

  if (element.type === 'relation') {
    const members = expectArray(element.members, `${context} members`).map((member, memberIndex) =>
      parseRelationMember(member, `${context} member at index ${memberIndex}`)
    );
    return tags === undefined
      ? { type: 'relation', id, members }
      : { type: 'relation', id, members, tags };
  }

  throw new Error(`${context} has unsupported type: ${String(element.type)}`);
}

function parseRelationMember(value: unknown, context: string): OsmRelationMember {
  const member = expectRecord(value, context);
  if (member.type !== 'node' && member.type !== 'way' && member.type !== 'relation') {
    throw new Error(`${context} has unsupported type: ${String(member.type)}`);
  }

  return {
    type: member.type,
    ref: expectPositiveInteger(member.ref, `${context} reference`),
    role: expectString(member.role, `${context} role`, true)
  };
}

function parseTags(value: unknown, context: string): OsmTags | undefined {
  if (value === undefined) return undefined;
  const tags = expectRecord(value, `${context} tags`);
  const parsed: OsmTags = Object.create(null) as OsmTags;
  for (const [key, tagValue] of Object.entries(tags)) {
    parsed[key] = expectString(tagValue, `${context} tag ${key}`, true);
  }
  return parsed;
}

function validateReferences(elements: OsmElement[]): void {
  const ids = new Set<string>();
  for (const element of elements) {
    const key = elementKey(element.type, element.id);
    if (ids.has(key)) {
      throw new Error(`OSM snapshot contains duplicate element ${key}`);
    }
    ids.add(key);
  }

  for (const element of elements) {
    if (element.type === 'way') {
      for (const nodeId of element.nodes) {
        expectReference(ids, 'node', nodeId, `way/${element.id}`);
      }
    }

    if (element.type === 'relation') {
      for (const member of element.members) {
        expectReference(ids, member.type, member.ref, `relation/${element.id}`);
      }
    }
  }
}

function expectReference(
  ids: Set<string>,
  type: OsmElement['type'],
  id: number,
  owner: string
): void {
  const key = elementKey(type, id);
  if (!ids.has(key)) {
    throw new Error(`OSM snapshot is missing ${key}, referenced by ${owner}`);
  }
}

function elementKey(type: OsmElement['type'], id: number): string {
  return `${type}/${id}`;
}

function countElements(elements: OsmElement[]): OsmElementCounts {
  const counts: OsmElementCounts = {
    nodes: 0,
    ways: 0,
    relations: 0,
    highwayWays: 0,
    buildingWays: 0,
    buildingRelations: 0
  };

  for (const element of elements) {
    if (element.type === 'node') {
      counts.nodes += 1;
      continue;
    }

    if (element.type === 'way') {
      counts.ways += 1;
      if (element.tags?.highway !== undefined) counts.highwayWays += 1;
      if (hasBuildingTag(element.tags)) counts.buildingWays += 1;
      continue;
    }

    counts.relations += 1;
    if (hasBuildingTag(element.tags)) counts.buildingRelations += 1;
  }

  return counts;
}

function hasBuildingTag(tags: OsmTags | undefined): boolean {
  return tags?.building !== undefined || tags?.['building:part'] !== undefined;
}

function parseJson(raw: string, description: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`Unable to parse ${description} as JSON`, { cause: error });
  }
}

function expectRecord(value: unknown, description: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${description} must be an object`);
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, description: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${description} must be an array`);
  }
  return value;
}

function expectNumber(value: unknown, description: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${description} must be a finite number`);
  }
  return value;
}

function expectPositiveNumber(value: unknown, description: string): number {
  const parsed = expectNumber(value, description);
  if (parsed <= 0) {
    throw new Error(`${description} must be greater than zero`);
  }
  return parsed;
}

function expectPositiveInteger(value: unknown, description: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${description} must be a positive safe integer`);
  }
  return value as number;
}

function expectString(value: unknown, description: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new Error(`${description} must be ${allowEmpty ? 'a string' : 'a non-empty string'}`);
  }
  return value;
}

function expectSlug(value: unknown, description: string): string {
  const slug = expectString(value, description);
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`${description} must contain lowercase words separated by hyphens`);
  }
  return slug;
}

function expectIsoTimestamp(value: unknown, description: string): string {
  const timestamp = expectString(value, description);
  if (!isUtcTimestamp(timestamp)) {
    throw new Error(`${description} must be a valid UTC ISO 8601 timestamp`);
  }
  return timestamp;
}

function expectUrl(value: unknown, description: string): string {
  const url = expectString(value, description);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('HTTPS required');
  } catch {
    throw new Error(`${description} must be a valid HTTPS URL`);
  }
  return url;
}
