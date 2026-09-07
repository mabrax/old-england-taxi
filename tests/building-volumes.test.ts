import { beforeAll, describe, expect, it } from 'vitest';
import {
  BUILDING_FALLBACK_HEIGHT_METRES,
  combineBuildingMeshes,
  compileBuildingVolumes,
  extrudeBuildingFootprint,
  inferBuildingHeight,
  isSupportedBuildingRelation,
  isSupportedBuildingWay
} from '../tools/zone-compiler/src/building-volumes';
import { compileLocalCoordinates } from '../tools/zone-compiler/src/local-coordinates';
import { loadZoneSource } from '../tools/zone-compiler/src/load-zone-source';
import type {
  BuildingFootprint,
  BuildingVolumeZone,
  LoadedZoneSource,
  LocalCoordinateZone,
  LocalLineFeature,
  OsmRelation,
  TriangulatedBuildingMesh
} from '../tools/zone-compiler/src/types';

describe('building height inference', () => {
  it('uses a usable source height before building levels', () => {
    expect(
      inferBuildingHeight({ building: 'yes', height: '18 m', 'building:levels': '4' })
    ).toEqual({ metres: 18, source: 'height', sourceValue: '18 m' });
    expect(
      inferBuildingHeight({ building: 'yes', height: '40 ft', 'building:levels': '8' })
    ).toEqual({ metres: 12.192, source: 'height', sourceValue: '40 ft' });
  });

  it('uses three metres per usable level when height is unusable', () => {
    expect(
      inferBuildingHeight({
        building: 'commercial',
        height: 'approximately 14',
        'building:levels': '3.5'
      })
    ).toEqual({
      metres: 10.5,
      source: 'building:levels',
      sourceValue: '3.5'
    });
  });

  it('uses the one fixed fallback for missing and unusable source values', () => {
    const fallback = {
      metres: BUILDING_FALLBACK_HEIGHT_METRES,
      source: 'fallback',
      sourceValue: String(BUILDING_FALLBACK_HEIGHT_METRES)
    };

    expect(inferBuildingHeight({ building: 'house' })).toEqual(fallback);
    expect(
      inferBuildingHeight({ building: 'house', height: '0', 'building:levels': '-2' })
    ).toEqual(fallback);
    expect(
      inferBuildingHeight({ building: 'office', height: '1001', 'building:levels': '201' })
    ).toEqual(fallback);
  });
});

describe('supported building footprints', () => {
  it('accepts closed building outlines and excludes open, no, and building-part ways', () => {
    expect(isSupportedBuildingWay(createBuildingLine({ building: 'yes' }))).toBe(true);
    expect(isSupportedBuildingWay(createBuildingLine({ building: 'no' }))).toBe(false);
    expect(
      isSupportedBuildingWay(createBuildingLine({ building: 'yes', 'building:part': 'yes' }))
    ).toBe(false);
    expect(
      isSupportedBuildingWay({
        ...createBuildingLine({ building: 'yes' }),
        closed: false
      })
    ).toBe(false);
  });

  it('accepts way-member building multipolygons and rejects other relation topology', () => {
    expect(
      isSupportedBuildingRelation(
        createBuildingRelation([
          { type: 'way', ref: 1, role: 'outer' },
          { type: 'way', ref: 2, role: 'inner' }
        ])
      )
    ).toBe(true);
    expect(
      isSupportedBuildingRelation({
        ...createBuildingRelation([{ type: 'way', ref: 1, role: 'outer' }]),
        tags: { building: 'yes', type: 'route' }
      })
    ).toBe(false);
    expect(
      isSupportedBuildingRelation(
        createBuildingRelation([{ type: 'relation', ref: 1, role: 'outer' }])
      )
    ).toBe(false);
  });
});

describe('building extrusion geometry', () => {
  it('extrudes a footprint without moving its base or roof boundary', () => {
    const footprint = createFootprint([
      [
        [0, 0],
        [10, 0],
        [10, 5],
        [0, 5]
      ]
    ]);
    const mesh = extrudeBuildingFootprint(footprint, 9);
    const coordinates = meshCoordinates(mesh);

    expect(mesh.vertexCount).toBe(24);
    expect(mesh.roofTriangleCount).toBe(2);
    expect(mesh.floorTriangleCount).toBe(2);
    expect(mesh.wallTriangleCount).toBe(8);
    expect(mesh.triangleCount).toBe(12);
    expect(Math.min(...mesh.positions.filter((_, index) => index % 3 === 1))).toBe(0);
    expect(Math.max(...mesh.positions.filter((_, index) => index % 3 === 1))).toBe(9);
    for (const point of footprint.rings[0]?.points ?? []) {
      expect(coordinates.has(`${point.x}|0|${point.z}`)).toBe(true);
      expect(coordinates.has(`${point.x}|9|${point.z}`)).toBe(true);
    }
    expect(allTrianglesAreNonDegenerate(mesh)).toBe(true);
    expect(capTrianglesHaveExpectedWinding(mesh)).toBe(true);
  });

  it('keeps a courtyard open while triangulating a footprint with a hole', () => {
    const footprint = createFootprint([
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10]
      ],
      [
        [3, 3],
        [3, 7],
        [7, 7],
        [7, 3]
      ]
    ]);
    const mesh = extrudeBuildingFootprint(footprint, 12);

    expect(mesh.roofTriangleCount).toBe(8);
    expect(mesh.floorTriangleCount).toBe(8);
    expect(mesh.wallTriangleCount).toBe(16);
    expect(horizontalAreaOfRoof(mesh)).toBe(84);
    expect(roofContainsPoint(mesh, { x: 5, z: 5 })).toBe(false);
    expect(allTrianglesAreNonDegenerate(mesh)).toBe(true);
    expect(capTrianglesHaveExpectedWinding(mesh)).toBe(true);
    expect(mesh.maximumDeviation).toBeLessThanOrEqual(1e-12);
  });

  it('produces byte-stable indexed geometry and rejects invalid inputs', () => {
    const footprint = createFootprint([
      [
        [-4, -2],
        [5, -1],
        [3, 6],
        [-2, 4]
      ]
    ]);

    expect(JSON.stringify(extrudeBuildingFootprint(footprint, 7.5))).toBe(
      JSON.stringify(extrudeBuildingFootprint(footprint, 7.5))
    );
    expect(() => extrudeBuildingFootprint(footprint, 0)).toThrow('positive finite');
    expect(() =>
      extrudeBuildingFootprint(
        { ...footprint, areaSquareMetres: footprint.areaSquareMetres + 1 },
        7.5
      )
    ).toThrow('recorded area');
  });

  it.each([
    { name: 'a backtracking spike', ring: [[0, 0], [10, 0], [10, 10], [5, 10], [5, 15], [5, 10], [0, 10]] },
    { name: 'a crossing boundary', ring: [[0, 0], [10, 0], [0, 8], [10, 10], [0, 10]] },
    { name: 'an overlapping adjacent edge', ring: [[0, 0], [10, 0], [5, 0], [10, 10], [0, 10]] }
  ])('rejects $name before triangulation', ({ ring }) => {
    expect(() => extrudeBuildingFootprint(createFootprint([ring as [number, number][]]), 12))
      .toThrow(/repeats|self-intersects|backtracks/);
  });

  it.each([
    { name: 'outside', hole: [[20, 2], [22, 2], [22, 4], [20, 4]] },
    { name: 'crossing', hole: [[8, 2], [12, 2], [12, 4], [8, 4]] },
    { name: 'touching', hole: [[0, 2], [2, 2], [2, 4], [0, 4]] }
  ])('rejects a $name courtyard with an explicit topology diagnostic', ({ hole }) => {
    const footprint = createFootprint([
      [[0, 0], [10, 0], [10, 10], [0, 10]], hole as [number, number][]
    ]);
    expect(() => extrudeBuildingFootprint(footprint, 12)).toThrow('strictly inside');
  });

  it('rejects nested holes and non-finite recorded areas', () => {
    const footprint = createFootprint([
      [[0, 0], [20, 0], [20, 20], [0, 20]],
      [[2, 2], [10, 2], [10, 10], [2, 10]],
      [[3, 3], [4, 3], [4, 4], [3, 4]]
    ]);
    expect(() => extrudeBuildingFootprint(footprint, 12)).toThrow('overlap, nest, or touch');
    const simple = createFootprint([[[0, 0], [10, 0], [10, 10], [0, 10]]]);
    expect(() => extrudeBuildingFootprint({ ...simple, areaSquareMetres: NaN }, 12)).toThrow('recorded area must be finite');
  });
});

describe.sequential('building multipolygon robustness', () => {
  let reference: LoadedZoneSource;
  beforeAll(async () => { reference = await loadZoneSource('trafalgar-square-london'); });

  it('assembles shuffled and reversed fragments without duplicating tagged member ways', () => {
    const lines = [
      fixtureLine(10, [[1, 0, 0], [2, 10, 0], [3, 10, 10]]),
      fixtureLine(20, [[1, 0, 0], [4, 0, 10], [3, 10, 10]]),
      fixtureLine(30, [[5, 2, 2], [6, 4, 2], [7, 4, 4], [8, 2, 4], [5, 2, 2]])
    ];
    const relation = createBuildingRelation([
      { type: 'way', ref: 20, role: '' },
      { type: 'way', ref: 30, role: 'inner' },
      { type: 'way', ref: 10, role: 'outer' }
    ]);
    const source = buildingFixture(reference, lines, [relation]);
    const before = JSON.stringify(source);
    const zone = compileBuildingVolumes(source);
    expect(zone.buildings).toHaveLength(1);
    expect(zone.buildings[0].footprint.rings.map((ring) => ring.nodeIds)).toEqual([
      [1, 2, 3, 4], [5, 6, 7, 8]
    ]);
    const shuffled = structuredClone(source);
    shuffled.osm.elements.reverse();
    const shuffledRelation = shuffled.osm.elements.find((item) => item.type === 'relation') as OsmRelation;
    shuffledRelation.members.reverse();
    expect(compileBuildingVolumes(shuffled)).toEqual(zone);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('assigns an island courtyard to its smallest containing outer', () => {
    const lines = [
      fixtureSquare(10, 1, 0, 20), fixtureSquare(20, 5, 2, 18),
      fixtureSquare(30, 9, 5, 15), fixtureSquare(40, 13, 7, 13)
    ];
    const relation = createBuildingRelation(lines.map((line, index) => ({
      type: 'way', ref: line.id, role: index % 2 === 0 ? 'outer' : 'inner'
    })));
    const zone = compileBuildingVolumes(buildingFixture(reference, lines, [relation]));
    expect(zone.buildings).toHaveLength(2);
    expect(zone.buildings.map((building) => building.footprint.rings.map((ring) => ring.nodeIds[0])))
      .toEqual([[1, 5], [9, 13]]);
  });

  it('rejects overlapping outer volumes even when each ring triangulates independently', () => {
    const lines = [fixtureSquare(10, 1, 0, 20), fixtureSquare(20, 5, 5, 15)];
    const relation = createBuildingRelation(lines.map((line) => ({ type: 'way', ref: line.id, role: 'outer' })));
    expect(() => compileBuildingVolumes(buildingFixture(reference, lines, [relation])))
      .toThrow('relation/1 has overlapping outer footprints');
  });

  it('reports duplicate and dangling members with OSM provenance', () => {
    const line = fixtureSquare(10, 1, 0, 20);
    const member = { type: 'way' as const, ref: 10, role: 'outer' };
    expect(() => compileBuildingVolumes(buildingFixture(reference, [line], [createBuildingRelation([member, member])])))
      .toThrow('relation/1 repeats member way/10');
    const open = fixtureLine(10, [[1, 0, 0], [2, 10, 0]]);
    expect(() => compileBuildingVolumes(buildingFixture(reference, [open], [createBuildingRelation([member])])))
      .toThrow('relation/1 outer members do not form unambiguous closed rings at node/1');
  });

  it('identifies the building when extrusion rejects a spiked outline', () => {
    const line = fixtureLine(123, [[1, 0, 0], [2, 10, 0], [3, 10, 10], [4, 5, 10], [5, 5, 15], [4, 5, 10], [6, 0, 10], [1, 0, 0]]);
    expect(() => compileBuildingVolumes(buildingFixture(reference, [line], [])))
      .toThrow(/Building way\/123 footprint 0:.*backtracks|Building way\/123 footprint 0:.*repeats/);
  });

  it('combines large meshes without passing geometry arrays as function arguments', () => {
    const source = buildingFixture(reference, [fixtureSquare(10, 1, 0, 20)], []);
    const building = compileBuildingVolumes(source).buildings[0];
    const mesh = building.mesh;
    const copies = 3000;
    const positions = Array.from({ length: mesh.positions.length * copies }, (_, index) => mesh.positions[index % mesh.positions.length]);
    const indices = Array.from({ length: mesh.indices.length * copies }, (_, index) =>
      mesh.indices[index % mesh.indices.length] + Math.floor(index / mesh.indices.length) * mesh.vertexCount);
    const large = { ...building, mesh: { ...mesh, positions, indices,
      roofTriangleCount: mesh.roofTriangleCount * copies, floorTriangleCount: mesh.floorTriangleCount * copies,
      wallTriangleCount: mesh.wallTriangleCount * copies } };
    const combined = combineBuildingMeshes([large, building]);
    expect(combined.vertexCount).toBe(mesh.vertexCount * (copies + 1));
    expect(combined.indices.at(-1)).toBe((mesh.indices.at(-1) as number) + mesh.vertexCount * copies);
  });
});

describe.sequential('fixed-zone building volumes', () => {
  let source: LoadedZoneSource;
  let local: LocalCoordinateZone;
  let zone: BuildingVolumeZone;
  let combined: TriangulatedBuildingMesh;

  beforeAll(async () => {
    source = await loadZoneSource('trafalgar-square-london');
    local = compileLocalCoordinates(source);
    zone = compileBuildingVolumes(source, local);
    combined = combineBuildingMeshes(zone.buildings);
  });

  it('extracts every supported outline while excluding building parts', () => {
    expect(zone.buildings).toHaveLength(1_005);
    expect(zone.buildings.filter((building) => building.source.type === 'way')).toHaveLength(
      988
    );
    expect(
      zone.buildings.filter((building) => building.source.type === 'relation')
    ).toHaveLength(17);
    expect(
      zone.buildings.reduce(
        (total, building) => total + building.footprint.rings.length - 1,
        0
      )
    ).toBe(48);
    expect(
      zone.buildings.some(
        (building) =>
          (building.source.type === 'way' &&
            (building.source.id === 297204228 || building.source.id === 183360827)) ||
          (building.source.type === 'relation' && building.source.id === 78616)
      )
    ).toBe(false);
  });

  it('retains every footprint node at its exact Phase 02 local coordinate', () => {
    const pointById = new Map(local.points.map((point) => [point.id, point.position]));

    for (const building of zone.buildings) {
      const meshPoints = meshCoordinates(building.mesh);
      for (const ring of building.footprint.rings) {
        expect(ring.nodeIds).toHaveLength(ring.points.length);
        ring.points.forEach((point, index) => {
          const sourcePoint = pointById.get(ring.nodeIds[index] as number);
          expect(sourcePoint).toBeDefined();
          expect(point).toEqual({ x: sourcePoint?.x, z: sourcePoint?.z });
          expect(meshPoints.has(`${point.x}|0|${point.z}`)).toBe(true);
          expect(meshPoints.has(`${point.x}|${building.height.metres}|${point.z}`)).toBe(
            true
          );
        });
      }
    }
  });

  it('applies source heights, source levels, and the fixed fallback consistently', () => {
    const sources = zone.buildings.reduce(
      (counts, building) => {
        counts[building.height.source] += 1;
        return counts;
      },
      { height: 0, 'building:levels': 0, fallback: 0 }
    );
    const directHeight = findWay(zone, 151297128);
    const levelHeight = findWay(zone, 38446590);
    const fallbackHeight = findWay(zone, 4266528);

    expect(sources).toEqual({ height: 11, 'building:levels': 502, fallback: 492 });
    expect(directHeight.height).toEqual({
      metres: 32,
      source: 'height',
      sourceValue: '32'
    });
    expect(levelHeight.height).toEqual({
      metres: 12,
      source: 'building:levels',
      sourceValue: '4'
    });
    expect(fallbackHeight.height).toEqual({
      metres: 12,
      source: 'fallback',
      sourceValue: '12'
    });
    expect(
      zone.buildings.every(
        (building) => Number.isFinite(building.height.metres) && building.height.metres > 0
      )
    ).toBe(true);
  });

  it('emits finite, indexed, non-degenerate fixed-zone volumes', () => {
    expect(combined.vertexCount).toBe(63_738);
    expect(combined.triangleCount).toBe(38_664);
    expect(combined.roofTriangleCount).toBe(8_709);
    expect(combined.floorTriangleCount).toBe(8_709);
    expect(combined.wallTriangleCount).toBe(21_246);
    expect(combined.maximumDeviation).toBeLessThanOrEqual(1e-8);
    expect(combined.positions.every(Number.isFinite)).toBe(true);
    expect(
      combined.indices.every(
        (index) => Number.isSafeInteger(index) && index >= 0 && index < combined.vertexCount
      )
    ).toBe(true);
    expect(allTrianglesAreNonDegenerate(combined)).toBe(true);
  });

  it('produces the same compiler result for repeated fixed-source runs', () => {
    expect(JSON.stringify(compileBuildingVolumes(source, local))).toBe(JSON.stringify(zone));
  });
});

function createBuildingLine(tags: Record<string, string>): LocalLineFeature {
  return {
    type: 'line',
    id: 1,
    nodeIds: [1, 2, 3, 1],
    positions: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 0, y: 0, z: 3 },
      { x: 0, y: 0, z: 0 }
    ],
    closed: true,
    tags
  };
}

function fixtureLine(id: number, nodes: Array<[number, number, number]>): LocalLineFeature {
  return { type: 'line', id, nodeIds: nodes.map(([node]) => node),
    positions: nodes.map(([, x, z]) => ({ x, y: 0, z })),
    closed: nodes[0][0] === nodes.at(-1)?.[0], tags: { building: 'yes' } };
}

function fixtureSquare(id: number, first: number, low: number, high: number): LocalLineFeature {
  return fixtureLine(id, [[first, low, low], [first + 1, high, low], [first + 2, high, high],
    [first + 3, low, high], [first, low, low]]);
}

function buildingFixture(reference: LoadedZoneSource, lines: LocalLineFeature[], relations: OsmRelation[]): LoadedZoneSource {
  const nodes = new Map(lines.flatMap((line) => line.nodeIds.map((id, index) => [id, {
    type: 'node' as const, id, lat: 51.50803 - line.positions[index].z / 111195,
    lon: -0.1281 + line.positions[index].x / 69200
  }] as const)));
  const ways = lines.map((line) => ({ type: 'way' as const, id: line.id, nodes: line.nodeIds, tags: line.tags }));
  return { ...reference, osm: { ...reference.osm, elements: [...nodes.values(), ...ways, ...relations] } };
}

function createBuildingRelation(members: OsmRelation['members']): OsmRelation {
  return {
    type: 'relation',
    id: 1,
    members,
    tags: { type: 'multipolygon', building: 'yes' }
  };
}

function createFootprint(
  rings: Array<Array<[x: number, z: number]>>
): BuildingFootprint {
  const footprintRings = rings.map((points, ringIndex) => ({
    nodeIds: points.map((_, pointIndex) => ringIndex * 100 + pointIndex + 1),
    points: points.map(([x, z]) => ({ x, z }))
  }));
  const areaSquareMetres = footprintRings.reduce((total, ring, ringIndex) => {
    const area = Math.abs(signedArea(ring.points));
    return ringIndex === 0 ? total + area : total - area;
  }, 0);
  return { rings: footprintRings, areaSquareMetres };
}

function signedArea(points: Array<{ x: number; z: number }>): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index] as { x: number; z: number };
    const next = points[(index + 1) % points.length] as { x: number; z: number };
    twiceArea += current.x * next.z - next.x * current.z;
  }
  return twiceArea / 2;
}

function meshCoordinates(mesh: TriangulatedBuildingMesh): Set<string> {
  const coordinates = new Set<string>();
  for (let index = 0; index < mesh.positions.length; index += 3) {
    coordinates.add(
      `${mesh.positions[index]}|${mesh.positions[index + 1]}|${mesh.positions[index + 2]}`
    );
  }
  return coordinates;
}

function allTrianglesAreNonDegenerate(mesh: TriangulatedBuildingMesh): boolean {
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const first = (mesh.indices[index] as number) * 3;
    const second = (mesh.indices[index + 1] as number) * 3;
    const third = (mesh.indices[index + 2] as number) * 3;
    const ab = [
      (mesh.positions[second] as number) - (mesh.positions[first] as number),
      (mesh.positions[second + 1] as number) - (mesh.positions[first + 1] as number),
      (mesh.positions[second + 2] as number) - (mesh.positions[first + 2] as number)
    ];
    const ac = [
      (mesh.positions[third] as number) - (mesh.positions[first] as number),
      (mesh.positions[third + 1] as number) - (mesh.positions[first + 1] as number),
      (mesh.positions[third + 2] as number) - (mesh.positions[first + 2] as number)
    ];
    const cross = [
      (ab[1] as number) * (ac[2] as number) - (ab[2] as number) * (ac[1] as number),
      (ab[2] as number) * (ac[0] as number) - (ab[0] as number) * (ac[2] as number),
      (ab[0] as number) * (ac[1] as number) - (ab[1] as number) * (ac[0] as number)
    ];
    if (Math.hypot(...cross) <= 1e-10) return false;
  }
  return true;
}

function capTrianglesHaveExpectedWinding(mesh: TriangulatedBuildingMesh): boolean {
  const roofEnd = mesh.roofTriangleCount * 3;
  const floorEnd = roofEnd + mesh.floorTriangleCount * 3;
  for (let index = 0; index < floorEnd; index += 3) {
    const normalY = triangleNormalY(
      mesh,
      mesh.indices[index] as number,
      mesh.indices[index + 1] as number,
      mesh.indices[index + 2] as number
    );
    if (index < roofEnd ? normalY <= 0 : normalY >= 0) return false;
  }
  return true;
}

function horizontalAreaOfRoof(mesh: TriangulatedBuildingMesh): number {
  let twiceArea = 0;
  for (let index = 0; index < mesh.roofTriangleCount * 3; index += 3) {
    twiceArea += triangleNormalY(
      mesh,
      mesh.indices[index] as number,
      mesh.indices[index + 1] as number,
      mesh.indices[index + 2] as number
    );
  }
  return twiceArea / 2;
}

function triangleNormalY(
  mesh: TriangulatedBuildingMesh,
  first: number,
  second: number,
  third: number
): number {
  const firstOffset = first * 3;
  const secondOffset = second * 3;
  const thirdOffset = third * 3;
  return (
    ((mesh.positions[secondOffset + 2] as number) -
      (mesh.positions[firstOffset + 2] as number)) *
      ((mesh.positions[thirdOffset] as number) - (mesh.positions[firstOffset] as number)) -
    ((mesh.positions[secondOffset] as number) - (mesh.positions[firstOffset] as number)) *
      ((mesh.positions[thirdOffset + 2] as number) -
        (mesh.positions[firstOffset + 2] as number))
  );
}

function roofContainsPoint(
  mesh: TriangulatedBuildingMesh,
  point: { x: number; z: number }
): boolean {
  for (let index = 0; index < mesh.roofTriangleCount * 3; index += 3) {
    const vertices = [0, 1, 2].map((offset) => {
      const positionOffset = (mesh.indices[index + offset] as number) * 3;
      return {
        x: mesh.positions[positionOffset] as number,
        z: mesh.positions[positionOffset + 2] as number
      };
    });
    if (
      pointInTriangle(
        point,
        vertices[0] as { x: number; z: number },
        vertices[1] as { x: number; z: number },
        vertices[2] as { x: number; z: number }
      )
    ) {
      return true;
    }
  }
  return false;
}

function pointInTriangle(
  point: { x: number; z: number },
  first: { x: number; z: number },
  second: { x: number; z: number },
  third: { x: number; z: number }
): boolean {
  const sign = (
    value: { x: number; z: number },
    edgeStart: { x: number; z: number },
    edgeEnd: { x: number; z: number }
  ) =>
    (value.x - edgeEnd.x) * (edgeStart.z - edgeEnd.z) -
    (edgeStart.x - edgeEnd.x) * (value.z - edgeEnd.z);
  const firstSign = sign(point, first, second);
  const secondSign = sign(point, second, third);
  const thirdSign = sign(point, third, first);
  return !(
    (firstSign < 0 || secondSign < 0 || thirdSign < 0) &&
    (firstSign > 0 || secondSign > 0 || thirdSign > 0)
  );
}

function findWay(zone: BuildingVolumeZone, id: number) {
  const building = zone.buildings.find(
    (candidate) => candidate.source.type === 'way' && candidate.source.id === id
  );
  if (building === undefined) throw new Error(`Missing fixed building way/${id}`);
  return building;
}
