import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { ZONES_DIRECTORY } from '../zone-compiler/src/zone-artifact-path';
import { CACHE_ROOT, cachedPaths, combinedCatalogue } from './cache';
import { GenerationQueue } from './jobs';
import { Geocoder } from './geocoder';

export function createGenerationService(options: { cacheRoot?: string; queue?: GenerationQueue; geocoder?: Geocoder; preparedDirectory?: string } = {}) {
  const root = options.cacheRoot ?? CACHE_ROOT;
  const queue = options.queue ?? new GenerationQueue(root);
  const geocoder = options.geocoder ?? new Geocoder(root);
  const preparedDirectory = options.preparedDirectory ?? ZONES_DIRECTORY;
  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (!pathname.startsWith('/api/zone-generation') && !pathname.startsWith('/zones/')) return next();
    try {
      if (pathname === '/zones/index.json' && req.method === 'GET') return json(res, 200, await combinedCatalogue(root, preparedDirectory));
      const asset = pathname.match(/^\/zones\/([a-z0-9]+(?:-[a-z0-9]+)*)\.(zone|qa|report)\.json$/);
      if (asset && req.method === 'GET') {
        const bytes = await readFile(join(cachedPaths(root, asset[1]).zonesDirectory, `${asset[1]}.${asset[2]}.json`)).catch(error => {
          if (error.code === 'ENOENT') return undefined;
          throw error;
        });
        if (!bytes) return next();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Content-Length': bytes.length });
        res.end(bytes); return;
      }
      if (!pathname.startsWith('/api/zone-generation')) return next();
      // This service runs on the user's machine. Browser writes must originate in this app.
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host ?? '')) return json(res, 403, { error: 'Generation is available through localhost only.' });
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'Cross-origin generation requests are not allowed.' });
      if (req.method === 'GET' && pathname === '/api/zone-generation') return json(res, 200, { available: true, maxCellMetres: 2000 });
      const job = pathname.match(/^\/api\/zone-generation\/jobs\/([a-f0-9-]{36})$/);
      if (job && req.method === 'GET') {
        const state = queue.get(job[1]);
        return json(res, state ? 200 : 404, state ?? { error: 'Generation job not found. The service may have restarted; try generating again.' });
      }
      if (req.method !== 'POST' || req.headers['x-zone-client'] !== 'browser-v1' || !req.headers['content-type']?.startsWith('application/json')) {
        return json(res, 400, { error: 'Expected an application/json request from the zone generation interface.' });
      }
      const body = await readBody(req);
      if (pathname === '/api/zone-generation/search') return json(res, 200, { locations: await geocoder.search(body.query) });
      if (pathname === '/api/zone-generation/jobs') {
        const allowed = ['latitude', 'longitude', 'widthMetres', 'heightMetres', 'label'];
        if (Object.keys(body).some(key => !allowed.includes(key))) throw new Error('Unknown generation option');
        return json(res, 202, queue.submit(body as unknown as Parameters<GenerationQueue['submit']>[0]));
      }
      const cancel = pathname.match(/^\/api\/zone-generation\/jobs\/([a-f0-9-]{36})\/cancel$/);
      if (cancel) {
        const state = queue.cancel(cancel[1]);
        return json(res, state ? 200 : 404, state ?? { error: 'Generation job not found' });
      }
      return json(res, 404, { error: 'Unknown generation endpoint' });
    } catch (error) {
      if (!res.headersSent) json(res, 400, { error: error instanceof Error ? error.message : 'Generation request failed' });
      else res.end();
    }
  };
  return { handle, close: () => queue.close() };
}
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2048) throw new Error('Generation request is too large');
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object');
  return value;
}
export function zoneGenerationPlugin(): Plugin {
  return {
    name: 'local-zone-generation',
    configureServer(server) {
      const service = createGenerationService();
      server.middlewares.use((req, res, next) => { void service.handle(req, res, next); });
      server.httpServer?.once('close', () => { void service.close(); });
    },
    configurePreviewServer(server) {
      const service = createGenerationService();
      server.middlewares.use((req, res, next) => { void service.handle(req, res, next); });
      server.httpServer.once('close', () => { void service.close(); });
    }
  };
}
