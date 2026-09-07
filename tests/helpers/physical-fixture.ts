import { readFileSync } from 'node:fs';
import type { ZoneArtifact, ZoneBounds3d } from '../../src/lib/zone/types';
import { parseZoneArtifact } from '../../src/lib/zone/zone-artifact';
import { extrudeBuildingFootprint } from '../../tools/zone-compiler/src/building-volumes';

export function physicalFixture(): ZoneArtifact {
  const artifact = JSON.parse(readFileSync(new URL('../../public/zones/trafalgar-square-london.zone.json', import.meta.url), 'utf8')) as ZoneArtifact;
  const rings = [
    [[-10, -10], [10, -10], [10, 10], [-10, 10]],
    [[-4, -4], [-4, 4], [4, 4], [4, -4]]
  ];
  const makeMesh = (coordinates: number[][][], area: number, height: number) => extrudeBuildingFootprint({
    rings: coordinates.map((ring, r) => ({
      role: r === 0 ? 'outer' : 'inner', nodeIds: ring.map((_, i) => i),
      points: ring.map(([x, z]) => ({ x, z }))
    })), areaSquareMetres: area
  }, height);
  const courtyard = makeMesh(rings, 336, 8);
  const concave = makeMesh([[[15, 5], [25, 5], [25, 8], [18, 8], [18, 15], [15, 15]]], 51, 12);
  const positions = [...courtyard.positions, ...concave.positions];
  const indices = [...courtyard.indices, ...concave.indices.map(i => i + courtyard.vertexCount)];
  artifact.geometry.buildings = {
    primitive: 'triangles', positions, indices,
    bounds: { minimumX: -10, maximumX: 25, minimumY: 0, maximumY: 12, minimumZ: -10, maximumZ: 15 },
    statistics: { buildings: 2, wayFootprints: 1, relationFootprints: 1, holes: 1, vertices: positions.length / 3, triangles: indices.length / 3 }
  };
  artifact.geometry.roads.positions = [-30, 0, -1, 30, 0, -1, 30, 0, 1, -30, 0, 1, -1, 0, -30, 1, 0, -30, 1, 0, 30, -1, 0, 30];
  artifact.geometry.roads.indices = [0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6];
  artifact.geometry.roads.bounds = { minimumX: -30, maximumX: 30, minimumY: 0, maximumY: 0, minimumZ: -30, maximumZ: 30 };
  artifact.geometry.roads.statistics.vertices = 8;
  artifact.geometry.roads.statistics.triangles = 4;
  artifact.coordinates.localBounds = { ...artifact.geometry.roads.bounds, maximumY: 12 };
  return parseZoneArtifact(artifact);
}

export function box(x: number, z: number, half = 0.25, minimumY = 0.1, maximumY = 1): ZoneBounds3d {
  return { minimumX: x - half, maximumX: x + half, minimumZ: z - half, maximumZ: z + half, minimumY, maximumY };
}
