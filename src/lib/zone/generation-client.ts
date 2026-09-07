import { parseCatalogue } from './catalogue';
import type { GenerationJob, LocationChoice } from './generation-types';

export function generationFailureMessage(message: string): string {
  if (/SweepLine|output ring|triangulat|Road polygon|zero-length segment/i.test(message)) {
    return 'The map geometry could not be processed. Try a smaller cell or a nearby point.';
  }
  return message;
}

export class GenerationApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function generationApi(path = '', body?: unknown): Promise<unknown> {
  const response = await fetch(`${import.meta.env.BASE_URL}api/zone-generation${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? { Accept: 'application/json' } : {
      Accept: 'application/json', 'Content-Type': 'application/json', 'X-Zone-Client': 'browser-v1'
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Live generation needs the local server. Start npm run dev or npm run preview, then reload.');
  }
  const value = await response.json();
  if (!response.ok) throw new GenerationApiError(typeof value?.error === 'string' ? value.error : `Request failed (HTTP ${response.status})`, response.status);
  return value;
}
export function parseGenerationJob(value: unknown): GenerationJob {
  const job = value as GenerationJob;
  if (!job || !/^[a-f0-9-]{36}$/.test(job.jobId) || typeof job.zoneId !== 'string' || typeof job.message !== 'string' ||
    !['queued','acquiring','compiling','verifying','ready','failed','cancelled'].includes(job.state) ||
    !Number.isFinite(job.createdAt) || !Number.isFinite(job.updatedAt)) throw new Error('Invalid generation progress response');
  if (job.state === 'ready') {
    if (!job.result || typeof job.result.cached !== 'boolean' || !Array.isArray(job.result.warnings)) throw new Error('Generation result is incomplete');
    parseCatalogue({ schemaVersion: 1, zones: [job.result.entry] });
    if (job.result.entry.id !== job.zoneId) throw new Error('Generated zone identity mismatch');
  }
  return job;
}
export function parseLocationChoices(value: unknown): LocationChoice[] {
  const choices = (value as { locations?: LocationChoice[] })?.locations;
  if (!Array.isArray(choices) || choices.length > 10 || choices.some(place => !place ||
    typeof place.label !== 'string' || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude))) {
    throw new Error('Invalid place search results');
  }
  return choices;
}
