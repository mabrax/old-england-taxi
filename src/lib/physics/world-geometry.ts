import type { IndexedTriangleGeometry, ZoneArtifact, ZoneBounds3d } from '../zone/types';

export type PlayEnvelope = Pick<ZoneBounds3d, 'minimumX' | 'maximumX' | 'minimumZ' | 'maximumZ'>;
export const PLAY_INSET_METRES = 1;
export const BOUNDARY_HEIGHT_METRES = 20;
const EPSILON = 1e-5; // 10 μm, below Rapier contact tolerance; touching is occupied.

export function derivePlayEnvelope(artifact: ZoneArtifact): PlayEnvelope {
  const p = artifact.geometry.roads.positions;
  let minimumX = Infinity, maximumX = -Infinity, minimumZ = Infinity, maximumZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    minimumX = Math.min(minimumX, p[i]); maximumX = Math.max(maximumX, p[i]);
    minimumZ = Math.min(minimumZ, p[i + 2]); maximumZ = Math.max(maximumZ, p[i + 2]);
  }
  const envelope = {
    minimumX: minimumX + PLAY_INSET_METRES, maximumX: maximumX - PLAY_INSET_METRES,
    minimumZ: minimumZ + PLAY_INSET_METRES, maximumZ: maximumZ - PLAY_INSET_METRES
  };
  if (!Object.values(envelope).every(Number.isFinite) ||
      envelope.minimumX >= envelope.maximumX || envelope.minimumZ >= envelope.maximumZ) {
    throw new Error('Clipped roads are too narrow to define the 1 m inset simulation area.');
  }
  return Object.freeze(envelope);
}

export function validBox(box: ZoneBounds3d): boolean {
  return Object.values(box).every(Number.isFinite) &&
    box.minimumX <= box.maximumX && box.minimumY <= box.maximumY && box.minimumZ <= box.maximumZ;
}

export function containsBox(envelope: PlayEnvelope, box: ZoneBounds3d, margin = 0): boolean {
  return validBox(box) && Number.isFinite(margin) && margin >= 0 &&
    box.minimumX >= envelope.minimumX + margin && box.maximumX <= envelope.maximumX - margin &&
    box.minimumZ >= envelope.minimumZ + margin && box.maximumZ <= envelope.maximumZ - margin;
}

/** A complete world AABB, including wheels/travel, must be supplied by the later vehicle. */
export function needsRecovery(envelope: PlayEnvelope, box: ZoneBounds3d): boolean {
  return !containsBox(envelope, box) || box.minimumY < -2 || box.maximumY > BOUNDARY_HEIGHT_METRES;
}

/** Read existing flat-extrusion faces. This is an occupancy index, not new collision geometry. */
export function indexBuildingGeometry(mesh: IndexedTriangleGeometry) {
  const p = mesh.positions;
  const roofs: number[] = []; // ax, az, bx, bz, cx, cz, roof height
  const caps = new Map<string, number>();
  const edges = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, delta: number) => {
    const value = (map.get(key) ?? 0) + delta;
    if (value === 0) map.delete(key); else map.set(key, value);
  };
  const incompatible = () => { throw new Error('Building mesh is not a closed, ground-based flat extrusion; physical occupancy is unavailable.'); };
  let floorTriangles = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ids = mesh.indices.slice(i, i + 3);
    const vertices = ids.map(id => p.slice(id * 3, id * 3 + 3));
    const [a, b, c] = vertices;
    const normalY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const horizontal = a[1] === b[1] && b[1] === c[1];
    if (horizontal) {
      if (a[1] < 0 || (a[1] === 0 ? normalY >= 0 : normalY <= 0)) incompatible();
      const key = vertices.map(v => `${v[0]},${v[2]}`).sort().join('|');
      add(caps, key, a[1] === 0 ? -1 : 1);
      if (a[1] === 0) floorTriangles++;
      // Match Rapier/Three's Float32 representation; keep SAT arithmetic in Float64.
      else roofs.push(...[a[0], a[2], b[0], b[2], c[0], c[2], a[1]].map(Math.fround));
    } else {
      const heights = [...new Set(vertices.map(v => v[1]))].sort((x, y) => x - y);
      // Compiler walls repeat one XZ endpoint, with exactly ground/roof levels.
      if (heights.length !== 2 || heights[0] !== 0 || heights[1] <= 0 ||
          new Set(vertices.map(v => `${v[0]},${v[2]}`)).size !== 2) incompatible();
    }
    // Weld by exact stored coordinates to verify directed closure, without altering the mesh.
    const keys = vertices.map(v => v.join(','));
    for (let j = 0; j < 3; j++) {
      const from = keys[j], to = keys[(j + 1) % 3];
      add(edges, from < to ? `${from}|${to}` : `${to}|${from}`, from < to ? 1 : -1);
    }
  }
  if (!roofs.length || caps.size || edges.size) incompatible();
  const roofTriangles = new Float64Array(roofs);
  return {
    positions: new Float32Array(p), indices: new Uint32Array(mesh.indices),
    roofTriangles, floorTriangles,
    occupied: (box: ZoneBounds3d): boolean => {
      if (!validBox(box)) throw new Error('Occupancy requires a finite ordered world box.');
      if (box.maximumY < -EPSILON) return false;
      for (let i = 0; i < roofTriangles.length; i += 7) {
        if (box.minimumY <= roofTriangles[i + 6] + EPSILON && triangleOverlapsBox(roofTriangles, i, box)) return true;
      }
      return false;
    }
  };
}

/** SAT tests the entire rectangle, including edge crossings and enclosed triangles. */
function triangleOverlapsBox(t: Float64Array, i: number, box: PlayEnvelope): boolean {
  const x = [t[i], t[i + 2], t[i + 4]], z = [t[i + 1], t[i + 3], t[i + 5]];
  if (Math.max(...x) < box.minimumX - EPSILON || Math.min(...x) > box.maximumX + EPSILON ||
      Math.max(...z) < box.minimumZ - EPSILON || Math.min(...z) > box.maximumZ + EPSILON) return false;
  const cx = (box.minimumX + box.maximumX) / 2, cz = (box.minimumZ + box.maximumZ) / 2;
  const hx = (box.maximumX - box.minimumX) / 2, hz = (box.maximumZ - box.minimumZ) / 2;
  for (let j = 0; j < 3; j++) {
    const k = (j + 1) % 3;
    const nx = z[k] - z[j], nz = x[j] - x[k];
    const projected = x.map((px, n) => nx * (px - cx) + nz * (z[n] - cz));
    const radius = Math.abs(nx) * hx + Math.abs(nz) * hz;
    const tolerance = EPSILON * Math.hypot(nx, nz);
    if (Math.min(...projected) > radius + tolerance || Math.max(...projected) < -radius - tolerance) return false;
  }
  return true;
}
