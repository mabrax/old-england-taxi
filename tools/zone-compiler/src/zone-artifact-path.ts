import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { assertZoneId } from './generation-request';

export const SOURCES_DIRECTORY = fileURLToPath(new URL('../sources/', import.meta.url));
export const ZONES_DIRECTORY = fileURLToPath(new URL('../../../public/zones/', import.meta.url));
export function zoneArtifactPath(id: string, directory = ZONES_DIRECTORY): string {
  assertZoneId(id);
  return resolve(directory, `${id}.zone.json`);
}
