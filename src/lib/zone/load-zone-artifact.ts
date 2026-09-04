import type { ZoneArtifact } from './types';
import {
  parseZoneArtifact,
  ZoneArtifactValidationError
} from './zone-artifact';

export const DEFAULT_ZONE_ARTIFACT_URL = `${import.meta.env.BASE_URL}zones/trafalgar-square-london.zone.json`;

export class ZoneArtifactLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ZoneArtifactLoadError';
  }
}

export async function loadZoneArtifact(
  url = DEFAULT_ZONE_ARTIFACT_URL,
  fetcher: typeof fetch = fetch
): Promise<ZoneArtifact> {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: 'application/json' }
    });
  } catch (error) {
    throw new ZoneArtifactLoadError(
      `Prepared zone artifact could not be loaded from ${url}.`,
      { cause: error }
    );
  }

  if (!response.ok) {
    throw new ZoneArtifactLoadError(
      `Prepared zone artifact request failed with HTTP ${response.status}.`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ZoneArtifactLoadError('Prepared zone artifact is not valid JSON.', {
      cause: error
    });
  }

  try {
    return parseZoneArtifact(payload);
  } catch (error) {
    if (error instanceof ZoneArtifactValidationError) {
      throw new ZoneArtifactLoadError(`Prepared zone artifact is invalid: ${error.message}`, {
        cause: error
      });
    }
    throw error;
  }
}
