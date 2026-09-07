import { afterEach, describe, expect, it, vi } from 'vitest';
import { GenerationApiError, GenerationConnectionError, generationApi } from '../src/lib/zone/generation-client';

afterEach(() => { vi.unstubAllGlobals(); });

describe('generation connection errors and recovery', () => {
  it.each([new TypeError('Failed to fetch'), new DOMException('Request timed out', 'TimeoutError')])('explains transport failure and does not replay a build request', async failure => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(failure);
    vi.stubGlobal('fetch', fetcher);
    await expect(generationApi('/jobs', { latitude: 10, longitude: 20 })).rejects.toThrow(GenerationConnectionError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('can reconnect after a refused request without replaying a search', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(Response.json({ available: true }));
    vi.stubGlobal('fetch', fetcher);
    await expect(generationApi('/search', { query: 'Pelluco' })).rejects.toThrow('local generation server');
    expect(await generationApi()).toEqual({ available: true });
    expect(fetcher.mock.calls.map(([, options]) => options?.method)).toEqual(['POST', 'GET']);
  });
  it('preserves provider errors separately from loss of the local server', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: 'Place search could not reach the map provider. Use coordinates.' }, { status: 502 })));
    const error = await generationApi('/search', { query: 'Pelluco' }).catch(reason => reason);
    expect(error).toBeInstanceOf(GenerationApiError);
    expect(error).not.toBeInstanceOf(GenerationConnectionError);
    if (!(error instanceof GenerationApiError)) throw new Error('Expected an API error');
    expect(error.message).toContain('map provider');
  });
  it('explains a static-only preview and a response interrupted during body reading', async () => {
    const interrupted = new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('stream interrupted')); } }), { headers: { 'Content-Type': 'application/json' } });
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('<html>Static app</html>', { headers: { 'Content-Type': 'text/html' } })).mockResolvedValueOnce(interrupted));
    await expect(generationApi()).rejects.toThrow('preview:start');
    await expect(generationApi()).rejects.toThrow('interrupted or invalid');
  });
});
