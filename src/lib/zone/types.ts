export const ZONE_ARTIFACT_SCHEMA_VERSION = 1 as const;
export const STREET_GRAPH_SCHEMA_VERSION = 1 as const;

export type ZoneStatus = 'loading' | 'ready' | 'error';

export interface GeographicBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface ZoneBounds3d {
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
  minimumZ: number;
  maximumZ: number;
}

export interface ZoneCoordinateSystem {
  schemaVersion: 1;
  sourceCrs: 'EPSG:4326';
  method: 'wgs84-local-tangent-plane';
  units: 'metres';
  origin: {
    latitude: number;
    longitude: number;
    ellipsoidHeightMetres: 0;
  };
  axes: {
    handedness: 'right';
    x: 'east';
    y: 'up';
    z: 'south';
  };
  groundPlaneY: 0;
}

export interface IndexedTriangleGeometry {
  primitive: 'triangles';
  bounds: ZoneBounds3d;
  positions: number[];
  indices: number[];
}

export interface RoadArtifactGeometry extends IndexedTriangleGeometry {
  statistics: {
    roadFeatures: number;
    centerlineSegments: number;
    surfacePolygons: number;
    vertices: number;
    triangles: number;
  };
}

export interface BuildingArtifactGeometry extends IndexedTriangleGeometry {
  statistics: {
    buildings: number;
    wayFootprints: number;
    relationFootprints: number;
    holes: number;
    vertices: number;
    triangles: number;
  };
}

export interface StreetGraphNode {
  id: number;
  position: [x: number, y: number, z: number];
}

export interface StreetGraphEdge {
  id: string;
  sourceWayId: number;
  sourceSegmentIndex: number;
  from: number;
  to: number;
  highway: string;
  widthMetres: number;
  lengthMetres: number;
}

export interface StreetGraph {
  schemaVersion: typeof STREET_GRAPH_SCHEMA_VERSION;
  kind: 'undirected';
  basis: 'osm-road-centerline-segments-intersecting-source-bounds';
  nodes: StreetGraphNode[];
  edges: StreetGraphEdge[];
  statistics: {
    nodes: number;
    edges: number;
    connectedComponents: number;
    totalLengthMetres: number;
  };
}

export interface ZoneArtifact {
  schemaVersion: typeof ZONE_ARTIFACT_SCHEMA_VERSION;
  slug: string;
  label: string;
  source: {
    schemaVersion: 1;
    bounds: GeographicBounds;
    approximateAreaSquareKilometres: number;
    snapshot: {
      file: string;
      format: 'overpass-json';
      byteLength: number;
      sha256: string;
      osmBaseTimestamp: string;
    };
    provenance: {
      dataset: string;
      api: string;
      endpoint: string;
      request: {
        method: 'POST';
        parameter: string;
        query: string;
      };
      attribution: string;
      attributionUrl: string;
      licence: {
        id: string;
        url: string;
      };
    };
  };
  coordinates: {
    system: ZoneCoordinateSystem;
    localBounds: ZoneBounds3d;
  };
  compiler: {
    name: 'old-england-taxi-zone-compiler';
    componentSchemaVersions: {
      source: 1;
      coordinates: 1;
      roadSurfaces: 1;
      buildingVolumes: 1;
      streetGraph: 1;
    };
    roadSurfaces: {
      supportedHighways: string[];
      widthRules: {
        precedence: ['width', 'lanes', 'highway-default'];
        laneWidthMetres: number;
        fallbackWidthMetres: Record<string, number>;
      };
      buffer: {
        cap: 'round';
        join: 'round';
        circleSegments: number;
        inputPrecisionMetres: number;
      };
      clippedToSourceBounds: true;
    };
    buildingVolumes: {
      supportedFootprints: {
        ways: 'closed-building-ways';
        relations: 'way-member-building-multipolygons';
        buildingParts: 'excluded';
      };
      heightRules: {
        precedence: ['height', 'building:levels', 'fallback'];
        minimumHeightMetres: number;
        maximumHeightMetres: number;
        minimumLevels: number;
        maximumLevels: number;
        levelHeightMetres: number;
        fallbackHeightMetres: number;
      };
      groundPlaneY: 0;
    };
  };
  geometry: {
    roads: RoadArtifactGeometry;
    buildings: BuildingArtifactGeometry;
  };
  streetGraph: StreetGraph;
}
