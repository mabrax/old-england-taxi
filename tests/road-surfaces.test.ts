import { beforeAll, describe, expect, it } from 'vitest';
import { compileLocalCoordinates, createLocalCoordinateTransform } from '../tools/zone-compiler/src/local-coordinates';
import { compileStreetGraph } from '../tools/zone-compiler/src/zone-artifact';
import { loadZoneSource } from '../tools/zone-compiler/src/load-zone-source';
import {
  compileRoadSurfaces,
  inferRoadWidth,
  isSupportedRoad,
  ROAD_FALLBACK_WIDTH_METRES,
  triangulateRoadPolygons
} from '../tools/zone-compiler/src/road-surfaces';
import type {
  LocalCoordinateZone,
  LocalLineFeature,
  RoadSurfaceZone,
  SupportedRoadHighway
} from '../tools/zone-compiler/src/types';

describe('road width inference', () => {
  it('uses valid width tags before lane counts and class defaults', () => {
    expect(
      inferRoadWidth({ highway: 'primary', width: '7.25 m', lanes: '4' })
    ).toEqual({ metres: 7.25, source: 'width', sourceValue: '7.25 m' });
    expect(inferRoadWidth({ highway: 'primary', lanes: '3' })).toEqual({
      metres: 9.6,
      source: 'lanes',
      sourceValue: '3'
    });
    expect(inferRoadWidth({ highway: 'service' })).toEqual({
      metres: ROAD_FALLBACK_WIDTH_METRES.service,
      source: 'highway-default',
      sourceValue: 'service'
    });
  });

  it('falls through unusable source values deterministically', () => {
    expect(
      inferRoadWidth({ highway: 'residential', width: 'about 6', lanes: '2' })
    ).toEqual({ metres: 6.4, source: 'lanes', sourceValue: '2' });
    expect(
      inferRoadWidth({ highway: 'residential', width: '0', lanes: '1.5' })
    ).toEqual({
      metres: ROAD_FALLBACK_WIDTH_METRES.residential,
      source: 'highway-default',
      sourceValue: 'residential'
    });
  });

  it('supports carriageway centerlines but excludes paths and highway areas', () => {
    expect(isSupportedRoad({ highway: 'tertiary' })).toBe(true);
    expect(isSupportedRoad({ highway: 'service', access: 'private' })).toBe(true);
    expect(isSupportedRoad({ highway: 'footway' })).toBe(false);
    expect(isSupportedRoad({ highway: 'residential', area: 'yes' })).toBe(false);
  });
});

describe('road surface geometry', () => {
  it('buffers a centerline to its inferred full width with round caps', () => {
    const surface = compileRoadSurfaces(
      createZone([
        createRoad(1, 'residential', [
          [1, 0, 0],
          [2, 10, 0]
        ], { width: '4' })
      ]),
      { clipToSourceBounds: false }
    );
    const points = surface.polygons.flatMap((polygon) => polygon.rings[0] ?? []);

    expect(surface.roads).toHaveLength(1);
    expect(surface.polygons).toHaveLength(1);
    expect(Math.min(...points.map((point) => point.x))).toBe(-2);
    expect(Math.max(...points.map((point) => point.x))).toBe(12);
    expect(Math.min(...points.map((point) => point.z))).toBe(-2);
    expect(Math.max(...points.map((point) => point.z))).toBe(2);
    expect(surface.mesh.areaSquareMetres).toBeCloseTo(52, 3);
  });

  it('unions connected perpendicular roads into one surface without an internal seam', () => {
    const surface = compileRoadSurfaces(
      createZone([
        createRoad(1, 'residential', [
          [1, -10, 0],
          [2, 0, 0],
          [3, 10, 0]
        ], { width: '4' }),
        createRoad(2, 'service', [
          [4, 0, -10],
          [2, 0, 0],
          [5, 0, 10]
        ], { width: '4' })
      ]),
      { clipToSourceBounds: false }
    );

    expect(surface.roads).toHaveLength(2);
    expect(surface.polygons).toHaveLength(1);
    expect(surface.polygons[0]?.rings).toHaveLength(1);
    expect(pointIsInSurface({ x: 0, z: 0 }, surface)).toBe(true);
    expect(surface.mesh.areaSquareMetres).toBeLessThan(208);
  });

  it('triangulates polygons with holes into finite, upward, area-preserving triangles', () => {
    const mesh = triangulateRoadPolygons([
      {
        rings: [
          [
            { x: 0, z: 0 },
            { x: 10, z: 0 },
            { x: 10, z: 10 },
            { x: 0, z: 10 }
          ],
          [
            { x: 3, z: 3 },
            { x: 3, z: 7 },
            { x: 7, z: 7 },
            { x: 7, z: 3 }
          ]
        ],
        areaSquareMetres: 84
      }
    ]);

    expect(mesh.vertexCount).toBe(8);
    expect(mesh.triangleCount).toBe(8);
    expect(mesh.areaSquareMetres).toBe(84);
    expect(mesh.maximumDeviation).toBeLessThanOrEqual(1e-12);
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
    expect(mesh.indices.every((index) => index >= 0 && index < mesh.vertexCount)).toBe(true);
    expect(allTrianglesFaceUp(mesh.positions, mesh.indices)).toBe(true);
  });

  it('produces byte-stable union and triangulation output', () => {
    const local = createZone([
      createRoad(1, 'primary', [
        [1, -20, -5],
        [2, 0, 0],
        [3, 20, 4]
      ], { lanes: '2' }),
      createRoad(2, 'service', [
        [4, 0, -12],
        [2, 0, 0],
        [5, 0, 15]
      ])
    ]);

    const first = JSON.stringify(
      compileRoadSurfaces(local, { clipToSourceBounds: false })
    );
    const second = JSON.stringify(
      compileRoadSurfaces(local, { clipToSourceBounds: false })
    );
    expect(second).toBe(first);
  });

  it('rejects zero-length road segments instead of emitting invalid geometry', () => {
    const local = createZone([
      createRoad(1, 'residential', [
        [1, 2, 3],
        [2, 2, 3]
      ])
    ]);

    expect(() =>
      compileRoadSurfaces(local, { clipToSourceBounds: false })
    ).toThrow('zero-length segment');
  });

  it('skips distant source segments while retaining pavement just outside the boundary', () => {
    const local = createZone([]);
    const transform = createLocalCoordinateTransform(local.metadata.sourceBounds);
    const east = transform.project({ latitude: 0, longitude: local.metadata.sourceBounds.east }).x;
    local.lines = [
      createRoad(1, 'service', [[1, 0, 0], [2, 10, 0], [3, 2000, 0], [4, 3000, 0]]),
      createRoad(2, 'service', [[5, 10000, 0], [6, 10010, 0]]),
      createRoad(3, 'service', [[7, east + 1, -10], [8, east + 1, 10]], { width: '4' })
    ];
    const surface = compileRoadSurfaces(local);
    expect(surface.roads.map((road) => road.id)).toEqual([1, 3]);
    expect(surface.diagnostics).toEqual({ skippedOutsideRoads: 1, skippedOutsideSegments: 2, bufferedSegments: 3 });
    expect(pointIsInSurface({ x: east - 0.5, z: 5 }, surface)).toBe(true);
    const graph = compileStreetGraph(surface);
    expect(graph.edges.map((edge) => edge.id)).toEqual(['1:0', '1:1']);
    expect(graph.nodes.some((node) => node.id === 4 || node.id === 7)).toBe(false);
  });

  it('keeps geometric crossings disconnected unless OSM shares a node', () => {
    const local = createZone([
      createRoad(20, 'service', [[1, -10, 0], [2, 10, 0]]),
      createRoad(10, 'service', [[3, 0, -10], [4, 0, 10]])
    ]);
    const surface = compileRoadSurfaces(local);
    expect(surface.polygons).toHaveLength(1);
    expect(compileStreetGraph(surface).statistics.connectedComponents).toBe(2);
    expect(compileRoadSurfaces({ ...local, lines: [...local.lines].reverse() })).toEqual(surface);
  });
});

describe.sequential('fixed-zone road surfaces', () => {
  let surface: RoadSurfaceZone;

  beforeAll(async () => {
    const source = await loadZoneSource();
    surface = compileRoadSurfaces(compileLocalCoordinates(source));
  });

  it('gives every supported fixed-zone way a finite, explainable width and in-zone surface', () => {
    const widthSources = surface.roads.reduce(
      (counts, road) => {
        counts[road.width.source] += 1;
        return counts;
      },
      { width: 0, lanes: 0, 'highway-default': 0 }
    );

    expect(surface.roads).toHaveLength(475);
    expect(surface.roads.every((road) => road.inZoneSegmentCount > 0)).toBe(true);
    expect(
      surface.roads.every(
        (road) => Number.isFinite(road.width.metres) && road.width.metres > 0
      )
    ).toBe(true);
    expect(
      surface.roads.reduce((total, road) => total + road.inZoneSegmentCount, 0)
    ).toBe(1_582);
    expect(widthSources).toEqual({ width: 5, lanes: 183, 'highway-default': 287 });
  });

  it('emits the clipped, unioned fixed network as valid renderable geometry', () => {
    const { positions, indices } = surface.mesh;
    const xs = positions.filter((_, index) => index % 3 === 0);
    const zs = positions.filter((_, index) => index % 3 === 2);

    expect(surface.metadata.clippedToSourceBounds).toBe(true);
    expect(surface.polygons).toHaveLength(11);
    expect(
      surface.polygons.reduce(
        (total, polygon) => total + polygon.rings.length - 1,
        0
      )
    ).toBe(79);
    expect(Math.min(...xs)).toBe(Math.fround(-501.664593));
    expect(Math.max(...xs)).toBe(Math.fround(501.616898));
    expect(Math.min(...zs)).toBe(Math.fround(-500.352));
    expect(Math.max(...zs)).toBe(Math.fround(500.302));
    expect(surface.mesh.vertexCount).toBe(6_399);
    expect(surface.mesh.triangleCount).toBe(6_535);
    expect(surface.mesh.areaSquareMetres).toBe(113_933.847633);
    expect(surface.mesh.maximumDeviation).toBeLessThanOrEqual(1e-8);
    expect(positions.every(Number.isFinite)).toBe(true);
    expect(indices.every((index) => index >= 0 && index < surface.mesh.vertexCount)).toBe(true);
    expect(allTrianglesFaceUp(positions, indices)).toBe(true);
    expect(allTrianglesFaceUp(Array.from(new Float32Array(positions)), indices)).toBe(true);
  });
});

function createRoad(
  id: number,
  highway: SupportedRoadHighway,
  nodes: Array<[id: number, x: number, z: number]>,
  tags: Record<string, string> = {}
): LocalLineFeature {
  return {
    type: 'line',
    id,
    nodeIds: nodes.map(([nodeId]) => nodeId),
    positions: nodes.map(([, x, z]) => ({ x, y: 0, z })),
    closed: nodes[0]?.[0] === nodes.at(-1)?.[0],
    tags: { highway, ...tags }
  };
}

function createZone(lines: LocalLineFeature[]): LocalCoordinateZone {
  return {
    metadata: {
      slug: 'test-zone',
      label: 'Test zone',
      sourceBounds: { south: -0.01, west: -0.01, north: 0.01, east: 0.01 },
      coordinateSystem: {
        schemaVersion: 1,
        sourceCrs: 'EPSG:4326',
        method: 'wgs84-local-tangent-plane',
        units: 'metres',
        origin: {
          latitude: 0,
          longitude: 0,
          ellipsoidHeightMetres: 0
        },
        axes: { handedness: 'right', x: 'east', y: 'up', z: 'south' },
        groundPlaneY: 0
      }
    },
    points: [],
    lines
  };
}

function allTrianglesFaceUp(positions: number[], indices: number[]): boolean {
  for (let index = 0; index < indices.length; index += 3) {
    const first = (indices[index] as number) * 3;
    const second = (indices[index + 1] as number) * 3;
    const third = (indices[index + 2] as number) * 3;
    const normalY =
      ((positions[second + 2] as number) - (positions[first + 2] as number)) *
        ((positions[third] as number) - (positions[first] as number)) -
      ((positions[second] as number) - (positions[first] as number)) *
        ((positions[third + 2] as number) - (positions[first + 2] as number));
    if (!Number.isFinite(normalY) || normalY <= 0) return false;
  }
  return true;
}

function pointIsInSurface(
  point: { x: number; z: number },
  surface: RoadSurfaceZone
): boolean {
  return surface.polygons.some((polygon) => {
    const [outer, ...holes] = polygon.rings;
    return (
      outer !== undefined &&
      pointIsInRing(point, outer) &&
      holes.every((hole) => !pointIsInRing(point, hole))
    );
  });
}

function pointIsInRing(
  point: { x: number; z: number },
  ring: Array<{ x: number; z: number }>
): boolean {
  let inside = false;
  for (
    let currentIndex = 0, previousIndex = ring.length - 1;
    currentIndex < ring.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = ring[currentIndex];
    const previous = ring[previousIndex];
    if (current === undefined || previous === undefined) continue;
    if (
      current.z > point.z !== previous.z > point.z &&
      point.x <
        ((previous.x - current.x) * (point.z - current.z)) /
          (previous.z - current.z) +
          current.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}
