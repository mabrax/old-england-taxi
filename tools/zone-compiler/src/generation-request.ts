import { createHash } from 'node:crypto';
import type { GeographicBounds } from './types';

export interface GenerationRequest {
  latitude: number;
  longitude: number;
  widthMetres?: number;
  heightMetres?: number;
  label?: string;
}
export interface ZoneRequest {
  version: 1;
  latitude: number;
  longitude: number;
  widthMetres: number;
  heightMetres: number;
  label: string;
  id: string;
  bounds: GeographicBounds;
}

export function assertZoneId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`Invalid zone slug / ID: ${String(id)}`);
  }
}

/** Version 1: WGS84 curvature at the center; dimensions are tangent-plane metres.
 * Small cells only. No antimeridian wrapping or polar projection is supported. */
export function createZoneRequest(input: GenerationRequest): ZoneRequest {
  const { latitude, longitude } = input;
  const widthMetres = input.widthMetres ?? 1000;
  const heightMetres = input.heightMetres ?? 1000;
  if (!Number.isFinite(latitude) || Math.abs(latitude) >= 75 ||
      !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new Error('Center must have finite WGS84 coordinates with latitude strictly between -75 and 75.');
  }
  for (const dimension of [widthMetres, heightMetres]) {
    if (!Number.isFinite(dimension) || dimension < 100 || dimension > 2000) {
      throw new Error('Cell dimensions must be finite metres between 100 and 2000.');
    }
  }
  if (input.label !== undefined && (typeof input.label !== 'string' || !input.label.trim() ||
      input.label.length > 120 || /[\x00-\x1f\x7f]/.test(input.label))) {
    throw new Error('Label must be 1–120 printable characters.');
  }
  const phi = latitude * Math.PI / 180;
  const e2 = 6.6943799901413165e-3;
  const d = 1 - e2 * Math.sin(phi) ** 2;
  const meridian = 6378137 * (1 - e2) / d ** 1.5;
  const parallel = 6378137 / Math.sqrt(d) * Math.cos(phi);
  const dy = heightMetres / 2 / meridian * 180 / Math.PI;
  const dx = widthMetres / 2 / parallel * 180 / Math.PI;
  const bounds = { south: latitude - dy, west: longitude - dx, north: latitude + dy, east: longitude + dx };
  if (bounds.south <= -75 || bounds.north >= 75 || bounds.west <= -180 || bounds.east >= 180) {
    throw new Error('Cell crosses the supported latitude range or antimeridian.');
  }
  // Full SHA-256 over exact normalized JSON numbers; label is never part of identity.
  const identity = { version: 1 as const, latitude: latitude || 0, longitude: longitude || 0, widthMetres, heightMetres };
  const id = `cell-${createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`;
  return { ...identity, label: input.label?.trim() ?? `${latitude}, ${longitude}`, id, bounds };
}

export function overpassQuery(input: GenerationRequest): string {
  const { bounds: b } = createZoneRequest(input);
  const box = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:60][maxsize:67108864];\n(\n${[
    'way["highway"]', 'way["building"]', 'relation["building"]',
    'way["building:part"]', 'relation["building:part"]'
  ].map(selector => `  ${selector}(${box});`).join('\n')}\n);\n(._;>>;);\nout body qt;`;
}
