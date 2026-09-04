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

export interface BuildingVolumePreview {
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
    minimumY: number;
    maximumY: number;
    minimumZ: number;
    maximumZ: number;
  };
  statistics: {
    buildings: number;
    wayFootprints: number;
    relationFootprints: number;
    holes: number;
    vertices: number;
    triangles: number;
  };
  positions: number[];
  indices: number[];
}
