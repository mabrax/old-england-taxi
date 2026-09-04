import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ZONE_SLUG,
  loadZoneSource
} from '../tools/zone-compiler/src/load-zone-source';
import type { OsmSnapshot } from '../tools/zone-compiler/src/types';

describe.sequential('fixed OSM zone source', () => {
  it('loads and validates the checked-in manifest and snapshot', async () => {
    const loaded = await loadZoneSource();

    expect(loaded.manifest).toMatchObject({
      schemaVersion: 1,
      slug: DEFAULT_ZONE_SLUG,
      label: 'Trafalgar Square, London',
      bounds: {
        south: 51.503533,
        west: -0.135325,
        north: 51.512527,
        east: -0.120875
      },
      approximateAreaSquareKilometres: 1.000149,
      snapshot: {
        file: 'source.osm.json',
        format: 'overpass-json',
        byteLength: 3242523,
        sha256: 'a56dce2329fdc5f1130d300839251119f6261bb08216c0b70363aa646b423484'
      },
      source: {
        dataset: 'OpenStreetMap',
        api: 'Overpass API',
        endpoint: 'https://overpass-api.de/api/interpreter',
        osmBaseTimestamp: '2026-09-04T12:56:50Z',
        attribution: '© OpenStreetMap contributors',
        attributionUrl: 'https://www.openstreetmap.org/copyright',
        licence: {
          id: 'ODbL-1.0',
          url: 'https://opendatacommons.org/licenses/odbl/1-0/'
        }
      }
    });
    expect(loaded.osm.version).toBe(0.6);
    expect(loaded.osm.osm3s.timestamp_osm_base).toBe('2026-09-04T12:56:50Z');
    expect(loaded.counts).toEqual({
      nodes: 17484,
      ways: 4111,
      relations: 23,
      highwayWays: 2417,
      buildingWays: 1608,
      buildingRelations: 23
    });
  });

  it('defines an approximately one-square-kilometre bounded source request', async () => {
    const { manifest } = await loadZoneSource();
    const { bounds } = manifest;
    const radiusKilometres = 6371.0088;
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const height = radians(bounds.north - bounds.south) * radiusKilometres;
    const meanLatitude = radians((bounds.south + bounds.north) / 2);
    const width =
      radians(bounds.east - bounds.west) * radiusKilometres * Math.cos(meanLatitude);
    const area = width * height;

    expect(area).toBeCloseTo(manifest.approximateAreaSquareKilometres, 6);
    expect(area).toBeGreaterThan(0.9);
    expect(area).toBeLessThan(1.1);
    expect(manifest.source.request.query).toContain(
      '(51.503533,-0.135325,51.512527,-0.120875)'
    );
    expect(manifest.source.request.query).toContain('way["highway"]');
    expect(manifest.source.request.query).toContain('way["building"]');
    expect(manifest.source.request.query).toContain('relation["building"]');
  });

  it('loads the same data without issuing a network request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network disabled'));

    try {
      const first = await loadZoneSource();
      const second = await loadZoneSource();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(second.manifest).toEqual(first.manifest);
      expect(second.counts).toEqual(first.counts);
      expect(second.osm.elements).toEqual(first.osm.elements);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('resolves the source independently of the current working directory', async () => {
    const initialDirectory = process.cwd();

    try {
      process.chdir(tmpdir());
      const loaded = await loadZoneSource();
      expect(loaded.manifest.slug).toBe(DEFAULT_ZONE_SLUG);
    } finally {
      process.chdir(initialDirectory);
    }
  });

  it('rejects slugs that could escape the source directory', async () => {
    await expect(loadZoneSource('../trafalgar-square-london')).rejects.toThrow(
      'Invalid zone slug'
    );
  });

  it('rejects a snapshot whose checked-in bytes have changed', async () => {
    const loaded = await loadZoneSource();
    const temporarySources = await mkdtemp(join(tmpdir(), 'zone-source-test-'));
    const temporaryZone = join(temporarySources, DEFAULT_ZONE_SLUG);

    try {
      await mkdir(temporaryZone);
      const [manifest, snapshot] = await Promise.all([
        readFile(loaded.files.manifest),
        readFile(loaded.files.snapshot)
      ]);
      snapshot[snapshot.byteLength - 2] ^= 1;
      await Promise.all([
        writeFile(join(temporaryZone, 'manifest.json'), manifest),
        writeFile(join(temporaryZone, 'source.osm.json'), snapshot)
      ]);

      await expect(
        loadZoneSource(DEFAULT_ZONE_SLUG, { sourcesDirectory: temporarySources })
      ).rejects.toThrow('Snapshot checksum mismatch');
    } finally {
      await rm(temporarySources, { recursive: true, force: true });
    }
  });

  it.each([
    { name: 'duplicate elements', mutate: (snapshot: OsmSnapshot) => {
      snapshot.elements.push(snapshot.elements[0]);
    }, error: 'duplicate element node/1' },
    { name: 'missing way references', mutate: (snapshot: OsmSnapshot) => {
      snapshot.elements.push({ type: 'way', id: 2, nodes: [1, 999] });
    }, error: 'missing node/999, referenced by way/2' },
    { name: 'missing relation references', mutate: (snapshot: OsmSnapshot) => {
      snapshot.elements.push({ type: 'relation', id: 2, members: [{ type: 'way', ref: 999, role: 'outer' }] });
    }, error: 'missing way/999, referenced by relation/2' },
    { name: 'unsafe OSM identifiers', mutate: (snapshot: OsmSnapshot) => {
      snapshot.elements[0].id = Number.MAX_SAFE_INTEGER + 1;
    }, error: 'positive safe integer' },
    { name: 'rolled-over source timestamps', mutate: (snapshot: OsmSnapshot) => {
      snapshot.osm3s.timestamp_osm_base = '2026-02-30T12:00:00Z';
    }, error: 'valid UTC ISO 8601 timestamp' },
    { name: 'Overpass partial-result remarks', mutate: (snapshot: OsmSnapshot) => {
      Object.assign(snapshot, { remark: 'runtime error: Query timed out' });
    }, error: 'partial results cannot be compiled' }
  ])('rejects $name even when the snapshot checksum is correct', async ({ mutate, error }) => {
    await withSourceFixture(mutate, async (directory) => {
      await expect(loadZoneSource(DEFAULT_ZONE_SLUG, { sourcesDirectory: directory })).rejects.toThrow(error);
    });
  });

  it('preserves arbitrary OSM tag names as own properties', async () => {
    await withSourceFixture((snapshot) => {
      snapshot.elements[0].tags = JSON.parse('{"__proto__":"mapped value","constructor":"mapped constructor"}') as Record<string, string>;
    }, async (directory) => {
      const loaded = await loadZoneSource(DEFAULT_ZONE_SLUG, { sourcesDirectory: directory });
      const tags = loaded.osm.elements[0].tags;
      expect(Object.hasOwn(tags ?? {}, '__proto__')).toBe(true);
      expect(tags?.['__proto__']).toBe('mapped value');
      expect(tags?.constructor).toBe('mapped constructor');
    });
  });
});

async function withSourceFixture(
  mutate: (snapshot: OsmSnapshot) => void,
  check: (sourcesDirectory: string) => Promise<void>
): Promise<void> {
  const reference = await loadZoneSource();
  const snapshot: OsmSnapshot = { ...reference.osm, osm3s: { ...reference.osm.osm3s },
    elements: [{ type: 'node', id: 1, lat: 51.5, lon: -0.12 }] };
  mutate(snapshot);
  const bytes = JSON.stringify(snapshot);
  const manifest = { ...reference.manifest, snapshot: { ...reference.manifest.snapshot,
    byteLength: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') } };
  const directory = await mkdtemp(join(tmpdir(), 'zone-invalid-source-'));
  try {
    const zone = join(directory, DEFAULT_ZONE_SLUG);
    await mkdir(zone);
    await writeFile(join(zone, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(join(zone, manifest.snapshot.file), bytes);
    await check(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
