import type { ZoneArtifact } from './types';
import {
  parseZoneArtifact,
  ZoneArtifactValidationError
} from './zone-artifact';

export const DEFAULT_ZONE_ARTIFACT_URL = `${import.meta.env.BASE_URL}zones/trafalgar-square-london.zone.json`;
export const DEFAULT_ZONE_LOAD_TIMEOUT_MS = 30_000;

export interface ZoneArtifactLoadOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class ZoneArtifactLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ZoneArtifactLoadError';
  }
}

export async function loadZoneArtifact(
  url = DEFAULT_ZONE_ARTIFACT_URL,
  fetcher: typeof fetch = fetch,
  options: ZoneArtifactLoadOptions = {}
): Promise<ZoneArtifact> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_ZONE_LOAD_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new ZoneArtifactLoadError('Zone artifact load timeout must be a positive finite timer duration.');
  }
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    if (options.signal?.aborted) abort();
    controller.signal.throwIfAborted();
    return await fetchArtifact(url, fetcher, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ZoneArtifactLoadError(
        timedOut ? `Prepared zone artifact loading timed out after ${timeoutMs} ms.` :
          'Prepared zone artifact loading was cancelled.',
        { cause: error }
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

async function fetchArtifact(url: string, fetcher: typeof fetch, signal: AbortSignal): Promise<ZoneArtifact> {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: 'application/json' },
      signal
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
    signal.throwIfAborted();
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
