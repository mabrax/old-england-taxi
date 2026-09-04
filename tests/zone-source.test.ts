import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ZONE_SLUG,
  loadZoneSource
} from '../tools/zone-compiler/src/load-zone-source';

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
});
