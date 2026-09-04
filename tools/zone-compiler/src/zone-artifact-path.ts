import { fileURLToPath } from 'node:url';

export const DEFAULT_ZONE_ARTIFACT_PATH = fileURLToPath(
  new URL('../../../public/zones/trafalgar-square-london.zone.json', import.meta.url)
);
