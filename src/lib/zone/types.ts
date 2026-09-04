export type ZoneStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ZoneArtifactDescriptor {
  id: string;
  label: string;
  version: string;
}
