import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createZoneRequest, overpassQuery, type GenerationRequest } from './generation-request';
import { loadZoneSource, parseOsmSnapshot, validateReferences } from './load-zone-source';
import { SOURCES_DIRECTORY } from './zone-artifact-path';
import type { ZoneSourceManifest } from './types';

export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
export const MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;
export interface AcquisitionOptions {
  sourcesDirectory?: string;
  fetcher?: typeof fetch;
  endpoint?: string;
  timeoutMs?: number;
  maxBytes?: number;
}
export { overpassQuery } from './generation-request';

/** The only network entry point. Existing immutable sources are reused, never refreshed. */
export async function acquireZone(input: GenerationRequest, options: AcquisitionOptions = {}) {
  const request = createZoneRequest(input);
  const sources = options.sourcesDirectory ?? SOURCES_DIRECTORY;
  const endpoint = options.endpoint ?? OVERPASS_ENDPOINT;
  const parsedEndpoint = new URL(endpoint);
  if (parsedEndpoint.protocol !== 'https:' || parsedEndpoint.username || parsedEndpoint.password || parsedEndpoint.hash) {
    throw new Error('Overpass endpoint must be HTTPS without credentials or a fragment');
  }
  const timeoutMs = options.timeoutMs ?? 90_000;
  const maxBytes = options.maxBytes ?? MAX_SNAPSHOT_BYTES;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000 ||
      !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_SNAPSHOT_BYTES) {
    throw new Error('Invalid acquisition deadline or byte limit');
  }
  await mkdir(sources, { recursive: true });
  const lock = join(sources, `.${request.id}.lock`);
  await mkdir(lock); // exclusive writer; fail clearly if another acquisition owns this ID
  let staging: string | undefined;
  try {
    const target = join(sources, request.id);
    const existing = await lstat(target).catch(error => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (existing) {
      const loaded = await loadZoneSource(request.id, { sourcesDirectory: sources });
      if (!loaded.manifest.generation || loaded.manifest.label !== request.label) {
        throw new Error('Immutable source already exists with different request metadata');
      }
      return { id: request.id, reused: true, manifest: loaded.manifest };
    }
    const query = overpassQuery(request);
    const bytes = await fetchSnapshot(endpoint, query, timeoutMs, maxBytes, options.fetcher ?? fetch);
    const osm = parseOsmSnapshot(bytes.toString('utf8'));
    validateReferences(osm.elements);
    if (osm.elements.length > 200_000) throw new Error('Snapshot exceeds 200,000 elements');
    const manifest: ZoneSourceManifest = {
      schemaVersion: 1, slug: request.id, label: request.label, generation: request,
      bounds: request.bounds, approximateAreaSquareKilometres: request.widthMetres * request.heightMetres / 1e6,
      snapshot: { file: 'source.osm.json', format: 'overpass-json', byteLength: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex') },
      source: { dataset: 'OpenStreetMap', api: 'Overpass API', endpoint,
        acquiredAt: new Date().toISOString(), osmBaseTimestamp: osm.osm3s.timestamp_osm_base,
        request: { method: 'POST', parameter: 'data', query },
        attribution: '© OpenStreetMap contributors', attributionUrl: 'https://www.openstreetmap.org/copyright',
        licence: { id: 'ODbL-1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/' } }
    };
    staging = await mkdtemp(join(sources, '.acquire-'));
    const stagedZone = join(staging, request.id);
    await mkdir(stagedZone);
    await writeFile(join(stagedZone, 'source.osm.json'), bytes, { flag: 'wx' });
    await writeFile(join(stagedZone, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    await loadZoneSource(request.id, { sourcesDirectory: staging });
    await rename(stagedZone, target); // both files become visible in one same-filesystem rename
    return { id: request.id, reused: false, manifest };
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
    await rm(lock, { recursive: true, force: true });
  }
}

async function fetchSnapshot(endpoint: string, query: string, timeoutMs: number, maxBytes: number, fetcher: typeof fetch) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Overpass acquisition timed out after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetcher(endpoint, { method: 'POST', redirect: 'error',
        headers: { Accept: '*/*', 'User-Agent': 'old-england-taxi-zone-compiler/1.0 (local developer acquisition)', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }).toString(), signal: controller.signal });
      if (!response.ok) throw new Error(`Overpass HTTP ${response.status}; retry acquisition later`);
      if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
        throw new Error('Overpass response must be application/json');
      }
      const announced = response.headers.get('content-length');
      if (announced !== null && (!/^\d+$/.test(announced) || Number(announced) > maxBytes)) {
        throw new Error('Overpass response exceeds the byte limit or has invalid Content-Length');
      }
      if (!response.body) throw new Error('Overpass response has no body');
      const reader = response.body.getReader();
      const cancel = () => { void reader.cancel().catch(() => {}); };
      controller.signal.addEventListener('abort', cancel, { once: true });
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          controller.signal.throwIfAborted();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) throw new Error('Overpass response exceeds the byte limit');
          chunks.push(value);
        }
      } finally {
        controller.signal.removeEventListener('abort', cancel);
        void reader.cancel().catch(() => {});
      }
      if (!size) throw new Error('Overpass response is empty');
      // Compressed HTTP Content-Length describes encoded bytes, so only compare unencoded bodies.
      if (announced !== null && !response.headers.get('content-encoding') && Number(announced) !== size) {
        throw new Error('Overpass response is partial: Content-Length mismatch');
      }
      return Buffer.concat(chunks, size);
    })()]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
