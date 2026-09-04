import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ZONE_ARTIFACT_URL,
  loadZoneArtifact,
  ZoneArtifactLoadError
} from '../src/lib/zone/load-zone-artifact';

describe('browser zone artifact loader', () => {
  let preparedBytes: string;

  beforeAll(async () => {
    preparedBytes = await readFile(
      new URL('../public/zones/trafalgar-square-london.zone.json', import.meta.url),
      'utf8'
    );
  });

  it('fetches and validates the prepared static artifact', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(preparedBytes, {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const artifact = await loadZoneArtifact(undefined, fetcher);

    expect(DEFAULT_ZONE_ARTIFACT_URL).toBe('/zones/trafalgar-square-london.zone.json');
    expect(fetcher).toHaveBeenCalledWith(DEFAULT_ZONE_ARTIFACT_URL, {
      headers: { Accept: 'application/json' }
    });
    expect(artifact.slug).toBe('trafalgar-square-london');
    expect(artifact.geometry.roads.statistics.triangles).toBe(6_537);
    expect(artifact.geometry.buildings.statistics.triangles).toBe(38_664);
  });

  it('reports network, HTTP, JSON, and schema failures clearly', async () => {
    await expect(
      loadZoneArtifact('/missing.zone.json', async () => {
        throw new Error('network disabled');
      })
    ).rejects.toThrow('could not be loaded');

    await expect(
      loadZoneArtifact(
        '/missing.zone.json',
        async () => new Response('missing', { status: 404 })
      )
    ).rejects.toThrow('HTTP 404');

    await expect(
      loadZoneArtifact(
        '/broken.zone.json',
        async () => new Response('{not-json', { status: 200 })
      )
    ).rejects.toThrow('not valid JSON');

    const incompatible = JSON.stringify({
      ...(JSON.parse(preparedBytes) as Record<string, unknown>),
      schemaVersion: 2
    });
    await expect(
      loadZoneArtifact(
        '/incompatible.zone.json',
        async () => new Response(incompatible, { status: 200 })
      )
    ).rejects.toThrow('schemaVersion');
  });

  it('uses one stable error type for expected load failures', async () => {
    await expect(
      loadZoneArtifact(
        '/missing.zone.json',
        async () => new Response('', { status: 503 })
      )
    ).rejects.toBeInstanceOf(ZoneArtifactLoadError);
  });
});
