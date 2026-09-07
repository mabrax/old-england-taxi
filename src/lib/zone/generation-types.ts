import type { ZoneCatalogueEntry } from './catalogue';
export interface LocationChoice { label: string; latitude: number; longitude: number; }
export type GenerationState = 'queued' | 'acquiring' | 'compiling' | 'verifying' | 'ready' | 'failed' | 'cancelled';
export interface GenerationJob {
  jobId: string;
  zoneId: string;
  label: string;
  state: GenerationState;
  message: string;
  createdAt: number;
  updatedAt: number;
  result?: { entry: ZoneCatalogueEntry; cached: boolean; warnings: { code: string; count: number; action: string }[] };
}
export const isFinished = (state: GenerationState) => ['ready', 'failed', 'cancelled'].includes(state);
