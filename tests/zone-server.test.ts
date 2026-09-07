import { createServer, request, type Server } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GenerationQueue, type Runner } from '../tools/zone-server/jobs';
import { Geocoder, parsePhoton } from '../tools/zone-server/geocoder';
import { cachedPaths, combinedCatalogue, prepared, readCatalogue } from '../tools/zone-server/cache';
import { createGenerationService } from '../tools/zone-server/server';
import { createZoneRequest } from '../tools/zone-compiler/src/generation-request';
import { parseGenerationJob, parseLocationChoices } from '../src/lib/zone/generation-client';
import { isFinished, type GenerationJob } from '../src/lib/zone/generation-types';

const roots: string[] = [];
const queues: GenerationQueue[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(queues.splice(0).map(queue => queue.close()));
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function workspace() { const root = await mkdtemp(join(tmpdir(), 'zone-service-')); roots.push(root); return root; }
const input = { latitude: 10, longitude: 20 };
async function resultFor(request = input): Promise<NonNullable<GenerationJob['result']>> {
  const entry = structuredClone((await readCatalogue(prepared.zonesDirectory)).zones[0]);
  entry.id = createZoneRequest(request).id;
  return { entry, cached: false, warnings: [] };
}
async function queueWith(runner?: Runner, deadline?: number) {
  const root = await workspace(); const queue = new GenerationQueue(root, runner, deadline); queues.push(queue); return { root, queue };
}
const abortable: Runner = (_request, _workdir, progress, signal) => {
  progress('acquiring', 'Downloading');
  return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
};

describe('background generation lifecycle', () => {
  it('deduplicates active requests, serializes work and cleans scratch directories', async () => {
    const releases: (() => void)[] = []; const started: number[] = [];
    const runner: Runner = async (request, _path, progress) => {
      started.push(request.latitude); progress('compiling', 'Building');
      await new Promise<void>(resolve => releases.push(resolve)); return resultFor(request);
    };
    const { root, queue } = await queueWith(runner);
    const first = queue.submit(input);
    expect(queue.submit({ ...input, label: 'Another name' }).jobId).toBe(first.jobId);
    const second = queue.submit({ ...input, latitude: 11 });
    await vi.waitFor(() => expect(started).toEqual([10]));
    expect(queue.get(second.jobId)?.state).toBe('queued');
    releases.shift()!();
    await vi.waitFor(() => expect(started).toEqual([10, 11]));
    releases.shift()!();
    await vi.waitFor(() => expect(queue.get(second.jobId)?.state).toBe('ready'));
    expect(parseGenerationJob(queue.get(first.jobId)).result?.entry.id).toBe(first.zoneId);
    await vi.waitFor(async () => expect(await readdir(root)).toEqual([]));
  });
  it('cancels both active and queued work and caps pending jobs', async () => {
    const { queue } = await queueWith(abortable);
    const jobs = Array.from({ length: 5 }, (_, i) => queue.submit({ ...input, latitude: 10 + i }));
    expect(() => queue.submit({ ...input, latitude: 20 })).toThrow('queue is full');
    await vi.waitFor(() => expect(queue.get(jobs[0].jobId)?.state).toBe('acquiring'));
    expect(queue.cancel(jobs[1].jobId)?.state).toBe('cancelled');
    expect(queue.cancel(jobs[0].jobId)?.state).toBe('cancelled');
    await vi.waitFor(() => expect(queue.get(jobs[2].jobId)?.state).toBe('acquiring'));
    expect(queue.get(jobs[1].jobId)?.state).toBe('cancelled');
  });
  it('reports timeout or compile failure and lets the queue continue', async () => {
    const runner: Runner = (request, ...rest) => request.latitude === 10 ? abortable(request, ...rest) : Promise.reject(new Error('Unsupported source geometry'));
    const { queue, root } = await queueWith(runner, 30);
    const first = queue.submit(input); const second = queue.submit({ ...input, latitude: 11 });
    await vi.waitFor(() => expect(queue.get(second.jobId)?.state).toBe('failed'));
    expect(queue.get(first.jobId)?.message).toContain('deadline');
    expect(queue.get(second.jobId)?.message).toContain('Unsupported source geometry');
    await vi.waitFor(async () => expect(await readdir(root)).toEqual([]));
  });
  it('verifies a prepared zone in the real child process without acquiring new data', async () => {
    const { queue, root } = await queueWith();
    const job = queue.submit({ latitude: 41.891, longitude: -87.634, widthMetres: 600, heightMetres: 600, label: 'User search alias' });
    await vi.waitFor(() => expect(isFinished(queue.get(job.jobId)!.state)).toBe(true), { timeout: 15_000 });
    const done = parseGenerationJob(queue.get(job.jobId));
    expect(done.state, done.message).toBe('ready');
    expect(done.result?.cached).toBe(true);
    expect(done.result?.entry.label).toBe('Chicago River North grid');
    expect(await readdir(root)).not.toContain('ready');
  }, 20_000);
  it('stops a real worker on cancellation and removes its scratch directory', async () => {
    const { queue, root } = await queueWith();
    const job = queue.submit({ latitude: 41.891, longitude: -87.634, widthMetres: 600, heightMetres: 600 });
    await vi.waitFor(() => expect(queue.get(job.jobId)?.state).toBe('verifying'), { interval: 10, timeout: 10_000 });
    expect(queue.cancel(job.jobId)?.state).toBe('cancelled');
    await queue.close();
    expect(await readdir(root)).toEqual([]);
    expect(queue.get(job.jobId)?.result).toBeUndefined();
  }, 15_000);
});

const photon = { features: [{ geometry: { coordinates: [139.7005, 35.6595] }, properties: { name: 'Crossing', city: 'Tokyo', country: 'Japan' } }] };
describe('place search', () => {
  it('normalizes Photon coordinates and uses the persistent cache across instances', async () => {
    const root = await workspace(); const fetcher = vi.fn<typeof fetch>(async () => Response.json(photon));
    const geocoder = new Geocoder(root, fetcher);
    expect(await geocoder.search('Tokyo')).toEqual([{ label: 'Crossing, Tokyo, Japan', longitude: 139.7005, latitude: 35.6595 }]);
    expect(await new Geocoder(root, fetcher).search('Tokyo')).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain('limit=5');
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('error');
    await expect(geocoder.search('Paris')).rejects.toThrow('wait a moment');
  });
  it('handles no matches, provider errors and oversized responses without caching errors', async () => {
    const root = await workspace();
    expect(await new Geocoder(root, async () => Response.json({ features: [] })).search('Empty')).toEqual([]);
    await expect(new Geocoder(root, async () => new Response('Busy', { status: 429 })).search('Busy')).rejects.toThrow('HTTP 429');
    await expect(new Geocoder(root, async () => new Response('x'.repeat(256 * 1024 + 1))).search('Large')).rejects.toThrow('too large');
    expect(await readdir(join(root, 'search'))).toHaveLength(1);
  });
  it('identifies an upstream network failure and keeps coordinate generation independent', async () => {
    const root = await workspace();
    const geocoder = new Geocoder(root, async () => { throw new TypeError('fetch failed'); });
    await expect(geocoder.search('Pelluco')).rejects.toThrow('map provider');
    expect(await readdir(root)).toEqual([]);
  });
  it('rejects malformed coordinates, invalid queries and insecure provider configuration', async () => {
    const root = await workspace();
    expect(() => parsePhoton({ features: [{ geometry: { coordinates: ['20', 10] }, properties: { name: 'Invalid' } }] })).toThrow();
    expect(() => parseLocationChoices({ locations: [null] })).toThrow();
    await expect(new Geocoder(root).search('x')).rejects.toThrow('2 and 200');
    await expect(new Geocoder(root, fetch, 'http://example.com/').search('Tokyo')).rejects.toThrow('HTTPS');
  });
});

describe('local HTTP generation API and cache publication', () => {
  async function service() {
    const { root, queue } = await queueWith(abortable);
    const api = createGenerationService({ cacheRoot: root, queue, geocoder: new Geocoder(root, async () => Response.json(photon)) });
    const server = createServer((req, res) => { void api.handle(req, res, () => { res.writeHead(404); res.end(); }); });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number }; const url = `http://127.0.0.1:${address.port}`;
    const headers = { 'Content-Type': 'application/json', 'X-Zone-Client': 'browser-v1' };
    const post = (path: string, body: unknown, extra = {}) => fetch(`${url}/api/zone-generation${path}`, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
    return { root, queue, url, post };
  }
  it('supports submit, progress, cancellation and search with actionable validation errors', async () => {
    const { url, post } = await service();
    expect((await fetch(`${url}/api/zone-generation`)).status).toBe(200);
    const response = await post('/jobs', input); expect(response.status).toBe(202);
    const job = parseGenerationJob(await response.json());
    expect((await fetch(`${url}/api/zone-generation/jobs/${job.jobId}`)).status).toBe(200);
    expect(parseGenerationJob(await (await post(`/jobs/${job.jobId}/cancel`, {})).json()).state).toBe('cancelled');
    expect((await (await post('/search', { query: 'Tokyo' })).json()).locations).toHaveLength(1);
    expect((await post('/jobs', { ...input, latitude: 90 })).status).toBe(400);
    expect((await post('/jobs', { ...input, outputPath: '/tmp/anything' })).status).toBe(400);
    expect((await post('/jobs', ['invalid'])).status).toBe(400);
    expect((await post('/jobs', { label: 'x'.repeat(3000) })).status).toBe(400);
    expect((await fetch(`${url}/api/zone-generation/jobs/00000000-0000-0000-0000-000000000000`)).status).toBe(404);
  });
  it('requires localhost and explicit same-origin browser writes', async () => {
    const { post, url } = await service();
    expect((await post('/jobs', input, { Origin: 'https://other.example' })).status).toBe(403);
    const foreignHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(`${url}/api/zone-generation`, { headers: { Host: 'other.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    expect(foreignHostStatus).toBe(403);
    expect((await post('/jobs', input, { 'X-Zone-Client': '' })).status).toBe(400);
    expect((await post('/jobs', input, { 'Content-Type': 'text/plain' })).status).toBe(400);
  });
  it('serves only completed cached products and merges their catalogue with prepared fixtures', async () => {
    const { root, url } = await service();
    const entry = (await resultFor()).entry;
    await mkdir(join(root, 'work-partial', 'zones'), { recursive: true });
    await writeFile(join(root, 'work-partial', 'zones', 'index.json'), JSON.stringify({ schemaVersion: 1, zones: [entry] }));
    expect((await combinedCatalogue(root)).zones.some(zone => zone.id === entry.id)).toBe(false);
    const paths = cachedPaths(root, entry.id);
    await mkdir(paths.zonesDirectory, { recursive: true });
    await writeFile(join(paths.zonesDirectory, 'index.json'), JSON.stringify({ schemaVersion: 1, zones: [entry] }));
    await writeFile(join(paths.zonesDirectory, `${entry.id}.zone.json`), '{"cached":true}');
    const catalogue = await (await fetch(`${url}/zones/index.json`)).json();
    expect(catalogue.zones).toHaveLength(6);
    expect(await (await fetch(`${url}/zones/${entry.id}.zone.json`)).json()).toEqual({ cached: true });
    expect((await fetch(`${url}/zones/missing.zone.json`)).status).toBe(404);
    expect(await readFile(join(paths.zonesDirectory, 'index.json'), 'utf8')).toContain(entry.id);
  });
});
