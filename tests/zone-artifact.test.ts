import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ZoneArtifact } from '../src/lib/zone/types';
import {
  parseZoneArtifact,
  ZoneArtifactValidationError
} from '../src/lib/zone/zone-artifact';
import {
  combineBuildingMeshes,
  compileBuildingVolumes
} from '../tools/zone-compiler/src/building-volumes';
import { compileLocalCoordinates } from '../tools/zone-compiler/src/local-coordinates';
import { loadZoneSource } from '../tools/zone-compiler/src/load-zone-source';
import { compileRoadSurfaces } from '../tools/zone-compiler/src/road-surfaces';
import {
  compileZoneArtifact,
  DEFAULT_ZONE_ARTIFACT_PATH,
  serializeZoneArtifact
} from '../tools/zone-compiler/src/zone-artifact';
import type { BuildingVolumeZone, RoadSurfaceZone } from '../tools/zone-compiler/src/types';

describe.sequential('Phase 05 zone artifact', () => {
  let artifact: ZoneArtifact;
  let roads: RoadSurfaceZone;
  let buildings: BuildingVolumeZone;
  let preparedBytes: string;

  beforeAll(async () => {
    const source = await loadZoneSource();
    const local = compileLocalCoordinates(source);
    roads = compileRoadSurfaces(local);
    buildings = compileBuildingVolumes(source, local);
    artifact = await compileZoneArtifact();
    preparedBytes = await readFile(DEFAULT_ZONE_ARTIFACT_PATH, 'utf8');
  });

  it('packages every renderable road and building triangle with complete metadata', () => {
    const buildingMesh = combineBuildingMeshes(buildings.buildings);

    expect(artifact).toMatchObject({
      schemaVersion: 1,
      slug: 'trafalgar-square-london',
      label: 'Trafalgar Square, London',
      source: {
        schemaVersion: 1,
        snapshot: {
          format: 'overpass-json',
          byteLength: 3_242_523,
          sha256: 'a56dce2329fdc5f1130d300839251119f6261bb08216c0b70363aa646b423484',
          osmBaseTimestamp: '2026-09-04T12:56:50Z'
        },
        provenance: {
          dataset: 'OpenStreetMap',
          licence: { id: 'ODbL-1.0' }
        }
      },
      coordinates: {
        system: {
          schemaVersion: 1,
          sourceCrs: 'EPSG:4326',
          method: 'wgs84-local-tangent-plane',
          units: 'metres',
          axes: { handedness: 'right', x: 'east', y: 'up', z: 'south' }
        }
      },
      compiler: {
        componentSchemaVersions: {
          source: 1,
          coordinates: 1,
          roadSurfaces: 1,
          buildingVolumes: 1,
          streetGraph: 1
        }
      }
    });
    expect(artifact.geometry.roads.positions).toEqual(roads.mesh.positions);
    expect(artifact.geometry.roads.indices).toEqual(roads.mesh.indices);
    expect(artifact.geometry.buildings.positions).toEqual(buildingMesh.positions);
    expect(artifact.geometry.buildings.indices).toEqual(buildingMesh.indices);
    expect(artifact.geometry.roads.statistics).toEqual({
      roadFeatures: 475,
      centerlineSegments: 1_582,
      surfacePolygons: 11,
      vertices: 6_401,
      triangles: 6_537
    });
    expect(artifact.geometry.buildings.statistics).toEqual({
      buildings: 1_005,
      wayFootprints: 988,
      relationFootprints: 17,
      holes: 48,
      vertices: 63_738,
      triangles: 38_664
    });
    expect(parseZoneArtifact(JSON.parse(preparedBytes) as unknown)).toEqual(artifact);
  });

  it('builds one graph edge for every centerline segment selected by the road compiler', () => {
    const expectedEdgeCount = roads.roads.reduce(
      (total, road) => total + road.inZoneSegmentCount,
      0
    );
    const nodeById = new Map(artifact.streetGraph.nodes.map((node) => [node.id, node]));
    const edgeById = new Map(artifact.streetGraph.edges.map((edge) => [edge.id, edge]));

    expect(artifact.streetGraph).toMatchObject({
      schemaVersion: 1,
      kind: 'undirected',
      basis: 'osm-road-centerline-segments-intersecting-source-bounds',
      statistics: {
        nodes: 1_513,
        edges: 1_582,
        connectedComponents: 11,
        totalLengthMetres: 20_418.613502
      }
    });
    expect(artifact.streetGraph.edges).toHaveLength(expectedEdgeCount);

    for (const road of roads.roads) {
      expect(road.inZoneSegmentIndices).toHaveLength(road.inZoneSegmentCount);
      for (const segmentIndex of road.inZoneSegmentIndices) {
        const edge = edgeById.get(`${road.id}:${segmentIndex}`);
        const fromId = road.nodeIds[segmentIndex] as number;
        const toId = road.nodeIds[segmentIndex + 1] as number;
        const fromPosition = road.positions[segmentIndex];
        const toPosition = road.positions[segmentIndex + 1];
        expect(edge).toMatchObject({
          sourceWayId: road.id,
          sourceSegmentIndex: segmentIndex,
          from: fromId,
          to: toId,
          highway: road.highway,
          widthMetres: road.width.metres
        });
        expect(nodeById.get(fromId)?.position).toEqual([
          fromPosition?.x,
          fromPosition?.y,
          fromPosition?.z
        ]);
        expect(nodeById.get(toId)?.position).toEqual([
          toPosition?.x,
          toPosition?.y,
          toPosition?.z
        ]);
      }
    }
  });

  it('uses canonical, trailing-newline serialization and matches the checked-in bytes', () => {
    const reordered = {
      streetGraph: artifact.streetGraph,
      geometry: artifact.geometry,
      compiler: artifact.compiler,
      coordinates: artifact.coordinates,
      source: artifact.source,
      label: artifact.label,
      slug: artifact.slug,
      schemaVersion: artifact.schemaVersion
    } as ZoneArtifact;
    const serialised = serializeZoneArtifact(artifact);

    expect(serializeZoneArtifact(reordered)).toBe(serialised);
    expect(serialised.endsWith('\n')).toBe(true);
    expect(serialised).toBe(preparedBytes);
  });

  it('rejects incompatible versions, geometry statistics, and graph topology', () => {
    expect(() =>
      parseZoneArtifact({ ...artifact, schemaVersion: 2 })
    ).toThrowError(ZoneArtifactValidationError);

    expect(() =>
      parseZoneArtifact({
        ...artifact,
        geometry: {
          ...artifact.geometry,
          roads: {
            ...artifact.geometry.roads,
            statistics: {
              ...artifact.geometry.roads.statistics,
              triangles: artifact.geometry.roads.statistics.triangles + 1
            }
          }
        }
      })
    ).toThrow('Road geometry triangles');

    expect(() =>
      parseZoneArtifact({
        ...artifact,
        streetGraph: {
          ...artifact.streetGraph,
          edges: [
            { ...artifact.streetGraph.edges[0], from: 999_999_999_999 },
            ...artifact.streetGraph.edges.slice(1)
          ]
        }
      })
    ).toThrow('invalid endpoints');

    expect(() =>
      parseZoneArtifact({
        ...artifact,
        geometry: {
          ...artifact.geometry,
          roads: {
            ...artifact.geometry.roads,
            statistics: {
              ...artifact.geometry.roads.statistics,
              centerlineSegments:
                artifact.geometry.roads.statistics.centerlineSegments + 1
            }
          }
        }
      })
    ).toThrow('Street graph edge and road centerline segment count');
  });

  it('compiles reproducibly without network access', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    try {
      const offline = await compileZoneArtifact();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(serializeZoneArtifact(offline)).toBe(preparedBytes);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
