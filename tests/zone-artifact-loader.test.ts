const DEFAULT_ZONE_ARTIFACT_URL = '/zones/trafalgar-square-london.zone.json';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  loadZoneArtifact,
  ZoneArtifactLoadError
} from '../src/lib/zone/load-zone-artifact';

describe('browser zone artifact loader', () => {
  let preparedBytes: string;
  afterEach(() => vi.useRealTimers());

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

    const artifact = await loadZoneArtifact(DEFAULT_ZONE_ARTIFACT_URL, fetcher);

    expect(DEFAULT_ZONE_ARTIFACT_URL).toBe('/zones/trafalgar-square-london.zone.json');
    expect(fetcher).toHaveBeenCalledWith(DEFAULT_ZONE_ARTIFACT_URL, {
      headers: { Accept: 'application/json' },
      signal: expect.any(AbortSignal)
    });
    expect(artifact.slug).toBe('trafalgar-square-london');
    expect(artifact.geometry.roads.statistics.triangles).toBe(6_535);
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

  it('cancels a pending request and avoids fetching when already cancelled', async () => {
    const controller = new AbortController();
    const fetcher = abortableFetch();
    const pending = loadZoneArtifact('/zone.json', fetcher, { signal: controller.signal });
    const assertion = expect(pending).rejects.toThrow('cancelled');
    controller.abort();
    await assertion;
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    fetcher.mockClear();
    await expect(loadZoneArtifact('/zone.json', fetcher, { signal: controller.signal })).rejects.toThrow('cancelled');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('aborts a request that exceeds the deadline and clears its timer', async () => {
    vi.useFakeTimers();
    const fetcher = abortableFetch();
    const pending = loadZoneArtifact('/zone.json', fetcher, { timeoutMs: 100 });
    const assertion = expect(pending).rejects.toThrow('timed out after 100 ms');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the deadline active while the response body is streaming', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{'));
        init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
      }
    })));
    const pending = loadZoneArtifact('/zone.json', fetcher, { timeoutMs: 100 });
    const assertion = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up its deadline and caller listener after success', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await loadZoneArtifact('/zone.json', async () => new Response(preparedBytes), { signal: controller.signal });
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

function abortableFetch() {
  return vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  }));
}
