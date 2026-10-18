import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { combineBuildingMeshes, extrudeBuildingFootprint } from '../tools/zone-compiler/src/building-volumes';
import { createStripGeometry, prepareFacadeAttributes, roadMarkingSegments } from '../src/lib/scene/drift-style';
import type { StreetGraph, StreetGraphEdge, ZoneBounds3d } from '../src/lib/zone/types';

const bounds: ZoneBounds3d = { minimumX: -50, maximumX: 50, minimumY: 0, maximumY: 0, minimumZ: -50, maximumZ: 50 };
const footprint = (x: number, z: number, width: number, depth: number) => {
  const points = [{ x, z }, { x: x + width, z }, { x: x + width, z: z + depth }, { x, z: z + depth }];
  return { rings: [{ nodeIds: [1, 2, 3, 4], points }], areaSquareMetres: width * depth };
};
const edge = (id: string, from: number, to: number, highway: string, widthMetres: number, sourceSegmentIndex = 0): StreetGraphEdge =>
  ({ id, sourceWayId: Number(id.split(':')[0]), sourceSegmentIndex, from, to, highway, widthMetres, lengthMetres: 0 });
const graph = (nodes: Array<[number, number, number]>, edges: StreetGraphEdge[]): StreetGraph => ({
  schemaVersion: 1, kind: 'undirected', basis: 'osm-road-centerline-segments-intersecting-source-bounds',
  nodes: nodes.map(([id, x, z]) => ({ id, position: [x, 0, z] })), edges,
  statistics: { nodes: nodes.length, edges: edges.length, connectedComponents: 1, totalLengthMetres: 0 }
});

describe('drift style geometry', () => {
  it('paints strips facing up so back-face culling keeps them visible from above', () => {
    const geometry = createStripGeometry([[0, 0, 10, 0], [0, 0, 0, -10], [3, 3, -4, 8]], 0.3, 0.02);
    const normals = geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) expect(normals.getY(i)).toBeCloseTo(1);
    geometry.dispose();
  });

  it('gives each wall a local frame and each building one facade colour', () => {
    const mesh = combineBuildingMeshes([
      { mesh: extrudeBuildingFootprint(footprint(0, 0, 10, 5), 9) },
      { mesh: extrudeBuildingFootprint(footprint(30, 0, 6, 6), 21) }
    ] as Parameters<typeof combineBuildingMeshes>[0]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
    geometry.setIndex(mesh.indices);
    prepareFacadeAttributes(geometry);
    const facade = geometry.getAttribute('facade'), position = geometry.getAttribute('position');
    const colours = [new Set<number>(), new Set<number>()];
    const wallLengths = new Set<number>();
    for (let i = 0; i < facade.count; i++) {
      const building = position.getX(i) < 20 ? 0 : 1;
      // Only walls and roofs are visible; downward floor faces are culled and keep no facade data.
      if (facade.getY(i) === 0 && position.getY(i) === 0) continue;
      colours[building].add(facade.getW(i));
      expect(facade.getZ(i)).toBeCloseTo(building === 0 ? 9 : 21);
      if (facade.getY(i) > 0) {
        wallLengths.add(Math.round(facade.getY(i)));
        expect(facade.getX(i)).toBeGreaterThanOrEqual(-1e-6);
        expect(facade.getX(i)).toBeLessThanOrEqual(facade.getY(i) + 1e-6);
      }
    }
    expect(colours.map(set => set.size)).toEqual([1, 1]);
    expect([...wallLengths].sort((a, b) => a - b)).toEqual([5, 6, 10]);
    geometry.dispose();
  });

  it('marks wide roads, skips service roads, trims junctions and clips to the zone', () => {
    const { yellow, white } = roadMarkingSegments(graph(
      [[1, -80, 0], [2, 0, 0], [3, 40, 0], [4, 0, 40], [5, 0, -40], [6, 20, 20], [7, 20, 40]],
      [edge('10:0', 1, 2, 'residential', 6.4, 0), edge('10:1', 2, 3, 'residential', 6.4, 1),
        edge('11:0', 4, 2, 'primary', 9.6, 0), edge('11:1', 2, 5, 'primary', 9.6, 1),
        edge('12:0', 6, 7, 'service', 3.5)]
    ), bounds);
    expect(white.length).toBeGreaterThan(0);
    for (const [x0, z0, x1, z1] of white) {
      expect(Math.min(x0, x1)).toBeGreaterThanOrEqual(-50 - 1e-9);
      expect(Math.abs(z0) + Math.abs(z1)).toBeLessThan(1e-9);
      // No paint inside the junction: half the widest road plus one metre.
      for (const x of [x0, x1]) expect(Math.abs(x)).toBeGreaterThanOrEqual(9.6 / 2 + 1 - 1e-9);
      expect(Math.hypot(x1 - x0, z1 - z0)).toBeLessThanOrEqual(3 + 1e-9);
    }
    expect(yellow).toHaveLength(4);
    for (const [x0, , x1] of yellow) {
      expect(Math.abs(x0)).toBeCloseTo(0.18);
      expect(x1).toBeCloseTo(x0);
    }
    expect([...white, ...yellow].some(([x0, z0]) => Math.abs(x0 - 20) < 1 && z0 > 15)).toBe(false);
  });
});
