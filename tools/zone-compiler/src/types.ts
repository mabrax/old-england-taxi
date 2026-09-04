export const ZONE_SOURCE_SCHEMA_VERSION = 1 as const;
export const OSM_VERSION = 0.6 as const;

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
