export const ZONE_SOURCE_SCHEMA_VERSION = 1 as const;
export const OSM_VERSION = 0.6 as const;
export const LOCAL_COORDINATE_SCHEMA_VERSION = 1 as const;
export const ROAD_SURFACE_SCHEMA_VERSION = 1 as const;
export const BUILDING_VOLUME_SCHEMA_VERSION = 1 as const;

export interface GeographicBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface ZoneSourceManifest {
  schemaVersion: typeof ZONE_SOURCE_SCHEMA_VERSION;
  slug: string;
  label: string;
  bounds: GeographicBounds;
  approximateAreaSquareKilometres: number;
  snapshot: {
    file: string;
    format: 'overpass-json';
    byteLength: number;
    sha256: string;
  };
  source: {
    dataset: string;
    api: string;
    endpoint: string;
    osmBaseTimestamp: string;
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
}

export type OsmTags = Record<string, string>;

export interface OsmNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: OsmTags;
}

export interface OsmWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: OsmTags;
}

export interface OsmRelationMember {
  type: OsmElement['type'];
  ref: number;
  role: string;
}

export interface OsmRelation {
  type: 'relation';
  id: number;
  members: OsmRelationMember[];
  tags?: OsmTags;
}

export type OsmElement = OsmNode | OsmWay | OsmRelation;

export interface OsmSnapshot {
  version: typeof OSM_VERSION;
  generator: string;
  osm3s: {
    timestamp_osm_base: string;
    copyright: string;
  };
  elements: OsmElement[];
}

export interface OsmElementCounts {
  nodes: number;
  ways: number;
  relations: number;
  highwayWays: number;
  buildingWays: number;
  buildingRelations: number;
}

export interface LoadedZoneSource {
  manifest: ZoneSourceManifest;
  osm: OsmSnapshot;
  counts: OsmElementCounts;
  files: {
    manifest: string;
    snapshot: string;
  };
}

export interface GeographicCoordinate {
  latitude: number;
  longitude: number;
}

export interface LocalPosition {
  x: number;
  y: number;
  z: number;
}

export interface LocalCoordinateSystemMetadata {
  schemaVersion: typeof LOCAL_COORDINATE_SCHEMA_VERSION;
  sourceCrs: 'EPSG:4326';
  method: 'wgs84-local-tangent-plane';
  units: 'metres';
  origin: GeographicCoordinate & {
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

export interface LocalPointFeature {
  type: 'point';
  id: number;
  position: LocalPosition;
  tags?: OsmTags;
}

export interface LocalLineFeature {
  type: 'line';
  id: number;
  nodeIds: number[];
  positions: LocalPosition[];
  closed: boolean;
  tags?: OsmTags;
}

export interface LocalCoordinateZone {
  metadata: {
    slug: string;
    label: string;
    sourceBounds: GeographicBounds;
    coordinateSystem: LocalCoordinateSystemMetadata;
  };
  points: LocalPointFeature[];
  lines: LocalLineFeature[];
}

export type SupportedRoadHighway =
  | 'motorway'
  | 'motorway_link'
  | 'trunk'
  | 'trunk_link'
  | 'primary'
  | 'primary_link'
  | 'secondary'
  | 'secondary_link'
  | 'tertiary'
  | 'tertiary_link'
  | 'unclassified'
  | 'residential'
  | 'living_street'
  | 'service'
  | 'road';

export type RoadWidthSource = 'width' | 'lanes' | 'highway-default';

export interface RoadWidthInference {
  metres: number;
  source: RoadWidthSource;
  sourceValue: string;
}

export interface RoadSurfacePoint {
  x: number;
  z: number;
}

export interface CompiledRoadCenterline {
  id: number;
  highway: SupportedRoadHighway;
  nodeIds: number[];
  positions: LocalPosition[];
  width: RoadWidthInference;
  segmentCount: number;
  inZoneSegmentCount: number;
}

export interface RoadSurfacePolygon {
  rings: RoadSurfacePoint[][];
  areaSquareMetres: number;
}

export interface TriangulatedRoadMesh {
  positions: number[];
  indices: number[];
  vertexCount: number;
  triangleCount: number;
  areaSquareMetres: number;
  maximumDeviation: number;
}

export interface RoadSurfaceZone {
  metadata: {
    schemaVersion: typeof ROAD_SURFACE_SCHEMA_VERSION;
    slug: string;
    label: string;
    sourceBounds: GeographicBounds;
    coordinateSystem: LocalCoordinateSystemMetadata;
    supportedHighways: SupportedRoadHighway[];
    widthRules: {
      precedence: ['width', 'lanes', 'highway-default'];
      laneWidthMetres: number;
      fallbackWidthMetres: Record<SupportedRoadHighway, number>;
    };
    buffer: {
      cap: 'round';
      join: 'round';
      circleSegments: number;
      inputPrecisionMetres: number;
    };
    clippedToSourceBounds: boolean;
  };
  roads: CompiledRoadCenterline[];
  polygons: RoadSurfacePolygon[];
  mesh: TriangulatedRoadMesh;
}

export type BuildingSourceType = 'way' | 'relation';
export type BuildingHeightSource = 'height' | 'building:levels' | 'fallback';

export interface BuildingHeightInference {
  metres: number;
  source: BuildingHeightSource;
  sourceValue: string;
}

export interface BuildingFootprintPoint {
  x: number;
  z: number;
}

export interface BuildingFootprintRing {
  nodeIds: number[];
  points: BuildingFootprintPoint[];
}

export interface BuildingFootprint {
  rings: BuildingFootprintRing[];
  areaSquareMetres: number;
}

export interface TriangulatedBuildingMesh {
  positions: number[];
  indices: number[];
  vertexCount: number;
  triangleCount: number;
  roofTriangleCount: number;
  floorTriangleCount: number;
  wallTriangleCount: number;
  maximumDeviation: number;
}

export interface CompiledBuildingVolume {
  source: {
    type: BuildingSourceType;
    id: number;
    footprintIndex: number;
  };
  building: string;
  footprint: BuildingFootprint;
  height: BuildingHeightInference;
  mesh: TriangulatedBuildingMesh;
}

export interface BuildingVolumeZone {
  metadata: {
    schemaVersion: typeof BUILDING_VOLUME_SCHEMA_VERSION;
    slug: string;
    label: string;
    sourceBounds: GeographicBounds;
    coordinateSystem: LocalCoordinateSystemMetadata;
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
  buildings: CompiledBuildingVolume[];
}
