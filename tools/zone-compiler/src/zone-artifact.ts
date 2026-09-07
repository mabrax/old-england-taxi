import {
  STREET_GRAPH_SCHEMA_VERSION,
  ZONE_ARTIFACT_SCHEMA_VERSION,
  type StreetGraph,
  type StreetGraphEdge,
  type StreetGraphNode,
  type ZoneArtifact,
  type ZoneBounds3d
} from '../../../src/lib/zone/types';
import { parseZoneArtifact } from '../../../src/lib/zone/zone-artifact';
import {
  combineBuildingMeshes,
  compileBuildingVolumes
} from './building-volumes';
import { compileLocalCoordinates } from './local-coordinates';
import { loadZoneSource, type LoadZoneSourceOptions } from './load-zone-source';
import { compileRoadSurfaces } from './road-surfaces';
import {
  BUILDING_VOLUME_SCHEMA_VERSION,
  LOCAL_COORDINATE_SCHEMA_VERSION,
  ROAD_SURFACE_SCHEMA_VERSION,
  ZONE_SOURCE_SCHEMA_VERSION,
  type LoadedZoneSource,
  type LocalCoordinateZone,
  type BuildingVolumeZone,
  type LocalPosition,
  type RoadSurfaceZone
} from './types';


const OUTPUT_PRECISION_DECIMALS = 6;

export async function compileZoneArtifact(
  slug: string, options: LoadZoneSourceOptions = {}
): Promise<ZoneArtifact> {
  const source = await loadZoneSource(slug, options);
  return compileLoadedZone(source);
}

export function compileLoadedZone(source: LoadedZoneSource): ZoneArtifact {
  const local = compileLocalCoordinates(source);
  const roads = compileRoadSurfaces(local);
  const buildingZone = compileBuildingVolumes(source, local);
  return packageZoneArtifact(source, local, roads, buildingZone);
}

export function packageZoneArtifact(source: LoadedZoneSource, local: LocalCoordinateZone, roads: RoadSurfaceZone, buildingZone: BuildingVolumeZone): ZoneArtifact {
  const buildingMesh = combineBuildingMeshes(buildingZone.buildings);
  const roadBounds = calculateBounds(roads.mesh.positions);
  const buildingBounds = calculateBounds(buildingMesh.positions);

  const artifact: ZoneArtifact = {
    schemaVersion: ZONE_ARTIFACT_SCHEMA_VERSION,
    slug: source.manifest.slug,
    label: source.manifest.label,
    source: {
      schemaVersion: source.manifest.schemaVersion,
      bounds: { ...source.manifest.bounds },
      approximateAreaSquareKilometres:
        source.manifest.approximateAreaSquareKilometres,
      snapshot: {
        ...source.manifest.snapshot,
        osmBaseTimestamp: source.manifest.source.osmBaseTimestamp
      },
      provenance: {
        dataset: source.manifest.source.dataset,
        api: source.manifest.source.api,
        endpoint: source.manifest.source.endpoint,
        request: { ...source.manifest.source.request },
        attribution: source.manifest.source.attribution,
        attributionUrl: source.manifest.source.attributionUrl,
        licence: { ...source.manifest.source.licence }
      }
    },
    coordinates: {
      system: local.metadata.coordinateSystem,
      localBounds: unionBounds(roadBounds, buildingBounds)
    },
    compiler: {
      name: 'old-england-taxi-zone-compiler',
      componentSchemaVersions: {
        source: ZONE_SOURCE_SCHEMA_VERSION,
        coordinates: LOCAL_COORDINATE_SCHEMA_VERSION,
        roadSurfaces: ROAD_SURFACE_SCHEMA_VERSION,
        buildingVolumes: BUILDING_VOLUME_SCHEMA_VERSION,
        streetGraph: STREET_GRAPH_SCHEMA_VERSION
      },
      roadSurfaces: {
        supportedHighways: [...roads.metadata.supportedHighways],
        widthRules: {
          precedence: [...roads.metadata.widthRules.precedence],
          laneWidthMetres: roads.metadata.widthRules.laneWidthMetres,
          fallbackWidthMetres: { ...roads.metadata.widthRules.fallbackWidthMetres }
        },
        buffer: { ...roads.metadata.buffer },
        clippedToSourceBounds: true
      },
      buildingVolumes: {
        supportedFootprints: { ...buildingZone.metadata.supportedFootprints },
        heightRules: {
          ...buildingZone.metadata.heightRules,
          precedence: [...buildingZone.metadata.heightRules.precedence]
        },
        groundPlaneY: buildingZone.metadata.groundPlaneY
      }
    },
    geometry: {
      roads: {
        primitive: 'triangles',
        bounds: roadBounds,
        statistics: {
          roadFeatures: roads.roads.length,
          centerlineSegments: roads.roads.reduce(
            (total, road) => total + road.inZoneSegmentCount,
            0
          ),
          surfacePolygons: roads.polygons.length,
          vertices: roads.mesh.vertexCount,
          triangles: roads.mesh.triangleCount
        },
        positions: roads.mesh.positions,
        indices: roads.mesh.indices
      },
      buildings: {
        primitive: 'triangles',
        bounds: buildingBounds,
        statistics: {
          buildings: buildingZone.buildings.length,
          wayFootprints: buildingZone.buildings.filter(
            (building) => building.source.type === 'way'
          ).length,
          relationFootprints: buildingZone.buildings.filter(
            (building) => building.source.type === 'relation'
          ).length,
          holes: buildingZone.buildings.reduce(
            (total, building) => total + building.footprint.rings.length - 1,
            0
          ),
          vertices: buildingMesh.vertexCount,
          triangles: buildingMesh.triangleCount
        },
        positions: buildingMesh.positions,
        indices: buildingMesh.indices
      }
    },
    streetGraph: compileStreetGraph(roads)
  };

  return parseZoneArtifact(artifact);
}

export function compileStreetGraph(roads: RoadSurfaceZone): StreetGraph {
  const nodePositions = new Map<number, [number, number, number]>();
  const edges: StreetGraphEdge[] = [];

  for (const road of [...roads.roads].sort((first, second) => first.id - second.id)) {
    for (const sourceSegmentIndex of road.inZoneSegmentIndices) {
      const from = road.nodeIds[sourceSegmentIndex];
      const to = road.nodeIds[sourceSegmentIndex + 1];
      const fromPosition = road.positions[sourceSegmentIndex];
      const toPosition = road.positions[sourceSegmentIndex + 1];
      if (
        from === undefined ||
        to === undefined ||
        fromPosition === undefined ||
        toPosition === undefined
      ) {
        throw new Error(
          `Road way/${road.id} has an unresolved in-zone graph segment ${sourceSegmentIndex}`
        );
      }
      addGraphNode(nodePositions, from, fromPosition);
      addGraphNode(nodePositions, to, toPosition);
      edges.push({
        id: `${road.id}:${sourceSegmentIndex}`,
        sourceWayId: road.id,
        sourceSegmentIndex,
        from,
        to,
        highway: road.highway,
        widthMetres: road.width.metres,
        lengthMetres: roundOutput(horizontalDistance(fromPosition, toPosition))
      });
    }
  }

  edges.sort(
    (first, second) =>
      first.sourceWayId - second.sourceWayId ||
      first.sourceSegmentIndex - second.sourceSegmentIndex
  );
  const nodes: StreetGraphNode[] = [...nodePositions]
    .sort(([first], [second]) => first - second)
    .map(([id, position]) => ({ id, position }));
  const statistics = calculateGraphStatistics(nodes, edges);

  return {
    schemaVersion: STREET_GRAPH_SCHEMA_VERSION,
    kind: 'undirected',
    basis: 'osm-road-centerline-segments-intersecting-source-bounds',
    nodes,
    edges,
    statistics
  };
}

export function serializeZoneArtifact(artifact: ZoneArtifact): string {
  parseZoneArtifact(artifact);
  return `${JSON.stringify(canonicalise(artifact))}\n`;
}

function addGraphNode(
  nodes: Map<number, [number, number, number]>,
  id: number,
  position: LocalPosition
): void {
  const tuple: [number, number, number] = [position.x, position.y, position.z];
  const existing = nodes.get(id);
  if (existing !== undefined) {
    if (
      existing[0] !== tuple[0] ||
      existing[1] !== tuple[1] ||
      existing[2] !== tuple[2]
    ) {
      throw new Error(`OSM node/${id} has conflicting road graph positions`);
    }
    return;
  }
  nodes.set(id, tuple);
}

function calculateGraphStatistics(
  nodes: StreetGraphNode[],
  edges: StreetGraphEdge[]
): StreetGraph['statistics'] {
  const adjacency = new Map<number, Set<number>>(
    nodes.map((node) => [node.id, new Set<number>()])
  );
  for (const edge of edges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  const visited = new Set<number>();
  let connectedComponents = 0;
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    connectedComponents += 1;
    const pending = [node.id];
    while (pending.length > 0) {
      const current = pending.pop() as number;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const neighbour of adjacency.get(current) ?? []) {
        if (!visited.has(neighbour)) pending.push(neighbour);
      }
    }
  }

  return {
    nodes: nodes.length,
    edges: edges.length,
    connectedComponents,
    totalLengthMetres: roundOutput(
      edges.reduce((total, edge) => total + edge.lengthMetres, 0)
    )
  };
}

function calculateBounds(positions: number[]): ZoneBounds3d {
  if (positions.length === 0 || positions.length % 3 !== 0) {
    throw new Error('Cannot calculate bounds for an empty or incomplete mesh');
  }
  const bounds: ZoneBounds3d = {
    minimumX: Infinity,
    maximumX: -Infinity,
    minimumY: Infinity,
    maximumY: -Infinity,
    minimumZ: Infinity,
    maximumZ: -Infinity
  };
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index] as number;
    const y = positions[index + 1] as number;
    const z = positions[index + 2] as number;
    bounds.minimumX = Math.min(bounds.minimumX, x);
    bounds.maximumX = Math.max(bounds.maximumX, x);
    bounds.minimumY = Math.min(bounds.minimumY, y);
    bounds.maximumY = Math.max(bounds.maximumY, y);
    bounds.minimumZ = Math.min(bounds.minimumZ, z);
    bounds.maximumZ = Math.max(bounds.maximumZ, z);
  }
  if (Object.values(bounds).some((value) => !Number.isFinite(value))) {
    throw new Error('Compiled mesh contains non-finite bounds');
  }
  return bounds;
}

function unionBounds(first: ZoneBounds3d, second: ZoneBounds3d): ZoneBounds3d {
  return {
    minimumX: Math.min(first.minimumX, second.minimumX),
    maximumX: Math.max(first.maximumX, second.maximumX),
    minimumY: Math.min(first.minimumY, second.minimumY),
    maximumY: Math.max(first.maximumY, second.maximumY),
    minimumZ: Math.min(first.minimumZ, second.minimumZ),
    maximumZ: Math.max(first.maximumZ, second.maximumZ)
  };
}

function horizontalDistance(first: LocalPosition, second: LocalPosition): number {
  return Math.hypot(second.x - first.x, second.z - first.z);
}

function roundOutput(value: number): number {
  return Number(value.toFixed(OUTPUT_PRECISION_DECIMALS));
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) {
    // Geometry dominates the artifact. Primitive arrays already have canonical
    // order; retaining them avoids cloning every coordinate and triangle index.
    return value.every((item) => item === null || typeof item !== 'object')
      ? value
      : value.map(canonicalise);
  }
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))
      .map(([key, item]) => [key, canonicalise(item)])
  );
}
