export type ZoneStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ZoneArtifactDescriptor {
  id: string;
  label: string;
  version: string;
}

export interface RoadSurfacePreview {
  schemaVersion: 1;
  slug: string;
  label: string;
  coordinateSystem: {
    units: 'metres';
    x: 'east';
    y: 'up';
    z: 'south';
  };
  bounds: {
    minimumX: number;
    maximumX: number;
    minimumZ: number;
    maximumZ: number;
  };
  statistics: {
    roads: number;
    segments: number;
    polygons: number;
    vertices: number;
    triangles: number;
  };
  positions: number[];
  indices: number[];
}
