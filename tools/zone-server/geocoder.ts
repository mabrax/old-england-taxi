import { createHash } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { LocationChoice } from '../../src/lib/zone/generation-types';
import { atomicWrite } from '../zone-compiler/src/zone-workflow';

export class Geocoder {
  private lastRequest = 0;
  private busy = false;
  constructor(private root: string, private fetcher: typeof fetch = fetch,
    private endpoint = process.env.ZONE_GEOCODER_URL ?? 'https://photon.komoot.io/api/') {}

  async search(query: unknown): Promise<LocationChoice[]> {
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 200 || /[\x00-\x1f]/.test(query)) {
      throw new Error('Enter a place name or address between 2 and 200 characters.');
    }
    const url = new URL(this.endpoint);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Geocoder endpoint must be an HTTPS Photon API URL');
    url.searchParams.set('q', query.trim());
    url.searchParams.set('limit', '5');
    url.searchParams.set('lang', 'en');
    const key = createHash('sha256').update(url.href).digest('hex');
    const file = join(this.root, 'search', `${key}.json`);
    const cached = await stat(file).catch(() => undefined);
    if (cached && Date.now() - cached.mtimeMs < 30 * 86400_000) {
      return parseLocations(JSON.parse(await readFile(file, 'utf8')));
    }
    if (this.busy || Date.now() - this.lastRequest < 1100) throw new Error('Please wait a moment before searching again.');
    this.busy = true;
    this.lastRequest = Date.now();
    try {
      const response = await this.fetcher(url.href, { signal: AbortSignal.timeout(15_000), redirect: 'error',
        headers: { Accept: 'application/json', 'User-Agent': 'old-england-taxi/0.2 (interactive local zone generation)' } });
      if (!response.ok) throw new Error(`Place search is unavailable (HTTP ${response.status}). You can enter coordinates instead.`);
      if (!response.body) throw new Error('Place search returned an empty response.');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 256 * 1024) throw new Error('Place search response is too large. Try a more specific name.');
          chunks.push(value);
        }
      } finally { void reader.cancel().catch(() => {}); }
      const payload = JSON.parse(Buffer.concat(chunks, length).toString('utf8'));
      const locations = parsePhoton(payload);
      await mkdir(join(this.root, 'search'), { recursive: true });
      await atomicWrite(file, JSON.stringify(locations));
      return locations;
    } finally { this.busy = false; }
  }
}
export function parsePhoton(value: unknown): LocationChoice[] {
  const payload = value as { features?: { geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> }[] };
  if (!payload || !Array.isArray(payload.features) || payload.features.length > 10) throw new Error('Invalid response from place search. Use coordinates or try again.');
  return parseLocations(payload.features.map(feature => {
    const p = feature.properties ?? {};
    const label = [...new Set([p.name, p.street, p.city, p.state, p.country].filter(v => typeof v === 'string' && v.trim()))].join(', ').slice(0, 120);
    return { label, longitude: feature.geometry?.coordinates?.[0], latitude: feature.geometry?.coordinates?.[1] };
  }));
}
function parseLocations(value: unknown): LocationChoice[] {
  if (!Array.isArray(value) || value.length > 10) throw new Error('Invalid place search results');
  for (const place of value) {
    if (!place || typeof place.label !== 'string' || !place.label || place.label.length > 120 ||
      !Number.isFinite(place.latitude) || Math.abs(place.latitude) > 90 ||
      !Number.isFinite(place.longitude) || Math.abs(place.longitude) > 180) throw new Error('Invalid place search coordinates');
  }
  return value as LocationChoice[];
}
