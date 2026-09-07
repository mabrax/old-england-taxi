import type { ZoneArtifact } from './types';
import {
  parseZoneArtifact,
  ZoneArtifactValidationError
} from './zone-artifact';

export const DEFAULT_ZONE_LOAD_TIMEOUT_MS = 30_000;

export interface ZoneArtifactLoadOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  sha256?: string;
  onHash?: (hash: string) => void;
}

export class ZoneArtifactLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ZoneArtifactLoadError';
  }
}

export async function loadZoneArtifact(
  url: string,
  fetcher: typeof fetch = fetch,
  options: ZoneArtifactLoadOptions = {}
): Promise<ZoneArtifact> {
  return loadPreparedJson(url, fetcher, options, parseZoneArtifact);
}

export async function loadPreparedJson<T>(
  url: string, fetcher: typeof fetch, options: ZoneArtifactLoadOptions, parse: (value: unknown) => T
): Promise<T> {
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
    return await fetchArtifact(url, fetcher, controller.signal, parse, options.sha256, options.onHash);
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

async function fetchArtifact<T>(url: string, fetcher: typeof fetch, signal: AbortSignal, parse: (value: unknown) => T, expectedHash?: string, onHash?: (hash: string) => void): Promise<T> {
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
    const bytes = await response.arrayBuffer();
    if (expectedHash || onHash) {
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
      onHash?.(hash);
      if (expectedHash && hash !== expectedHash) throw new ZoneArtifactLoadError('Prepared asset hash mismatch; rebuild or reload the catalogue.');
    }
    payload = JSON.parse(new TextDecoder().decode(bytes));
    signal.throwIfAborted();
  } catch (error) {
    if (error instanceof ZoneArtifactLoadError) throw error;
    throw new ZoneArtifactLoadError('Prepared zone artifact is not valid JSON.', {
      cause: error
    });
  }

  try {
    return parse(payload);
  } catch (error) {
    if (error instanceof ZoneArtifactValidationError) {
      throw new ZoneArtifactLoadError(`Prepared zone artifact is invalid: ${error.message}`, {
        cause: error
      });
    }
    throw error;
  }
}
