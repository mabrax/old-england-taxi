import type { ZoneArtifact, ZoneBounds3d, IndexedTriangleGeometry } from '../zone/types';
import type { PhysicalWorld } from './physical-world';
import { VEHICLE, SPAWN_Y, transform, yawPose, type Pose } from './vehicle-config';

type Point = { x: number; z: number };
type Polygon = Point[];
const AREA_EPSILON = 1e-7;
const area = (p: Polygon) => Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a.x * b.z - a.z * b.x; }, 0)) / 2;
function clip(p: Polygon, a: Point, b: Point, sign: number): Polygon {
  const result: Polygon = [];
  const distance = (v: Point) => sign * ((b.x - a.x) * (v.z - a.z) - (b.z - a.z) * (v.x - a.x));
  for (let i = 0; i < p.length; i++) {
    const u = p[i], v = p[(i + 1) % p.length], du = distance(u), dv = distance(v);
    if (du >= 0) result.push(u);
    if ((du >= 0) !== (dv >= 0)) { const t = du / (du - dv); result.push({ x: u.x + t * (v.x - u.x), z: u.z + t * (v.z - u.z) }); }
  }
  return result;
}
/** Subtract the actual road triangle union. Handles holes/overlap; no point-sampling certificate.
 * Limits fragments conservatively: difficult coverage is ineligible, never assumed paved. */
export function indexPavement(mesh: IndexedTriangleGeometry) {
  const triangles: { points: Point[]; sign: number; minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const points = mesh.indices.slice(i, i + 3).map(id => ({ x: Math.fround(mesh.positions[id * 3]), z: Math.fround(mesh.positions[id * 3 + 2]) }));
    const [a, b, c] = points;
    const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    if (Math.abs(cross) < AREA_EPSILON) continue;
    triangles.push({ points, sign: Math.sign(cross), minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x), minZ: Math.min(a.z, b.z, c.z), maxZ: Math.max(a.z, b.z, c.z) });
  }
  return {
    covers(rectangle: Polygon): boolean {
      const minX = Math.min(...rectangle.map(p => p.x)), maxX = Math.max(...rectangle.map(p => p.x));
      const minZ = Math.min(...rectangle.map(p => p.z)), maxZ = Math.max(...rectangle.map(p => p.z));
      let remaining = [rectangle];
      for (const t of triangles) {
        if (t.maxX < minX || t.minX > maxX || t.maxZ < minZ || t.minZ > maxZ) continue;
        const next: Polygon[] = [];
        for (let p of remaining) {
          for (let e = 0; e < 3 && p.length; e++) {
            const a = t.points[e], b = t.points[(e + 1) % 3];
            const outside = clip(p, a, b, -t.sign);
            if (outside.length >= 3 && area(outside) > AREA_EPSILON) next.push(outside);
            p = clip(p, a, b, t.sign);
          }
        }
        remaining = next;
        if (!remaining.length) return true;
        if (remaining.length > 256) return false;
      }
      return false;
    }
  };
}

/** A conservative rotated box encloses the chassis and every wheel at full suspension travel
 * and steering. Wheels remain inside its X/Z bounds even at maximum steering. */
export function vehicleBounds(pose: Pose, margin = 0, forward = 0, reverse = 0): ZoneBounds3d {
  const points = [];
  for (const x of [-VEHICLE.halfWidth - margin, VEHICLE.halfWidth + margin])
    for (const y of [-SPAWN_Y, VEHICLE.halfHeight + margin])
      for (const z of [-VEHICLE.halfLength - margin - reverse, VEHICLE.halfLength + margin + forward])
        points.push(transform({ x, y, z }, pose));
  return {
    minimumX: Math.min(...points.map(p => p.x)), maximumX: Math.max(...points.map(p => p.x)),
    minimumY: Math.min(...points.map(p => p.y)), maximumY: Math.max(...points.map(p => p.y)),
    minimumZ: Math.min(...points.map(p => p.z)), maximumZ: Math.max(...points.map(p => p.z))
  };
}
export function pavementRectangle(pose: Pose, forward = 0, reverse = 0) {
  const w = VEHICLE.halfWidth + VEHICLE.clearanceMargin, l = VEHICLE.halfLength + VEHICLE.clearanceMargin;
  return [[-w, -l - reverse], [w, -l - reverse], [w, l + forward], [-w, l + forward]].map(([x, z]) => transform({ x, y: 0, z }, pose));
}
export function createSpawnSearch(artifact: ZoneArtifact, physical: PhysicalWorld) {
  const pavement = indexPavement(artifact.geometry.roads);
  const validate = (pose: Pose) => {
    if (!Object.values(pose.position).every(Number.isFinite) || !Object.values(pose.rotation).every(Number.isFinite) ||
        pose.position.y !== SPAWN_Y || pose.rotation.x !== 0 || pose.rotation.z !== 0 ||
        Math.abs(Math.hypot(...Object.values(pose.rotation)) - 1) > 1e-6) return { clear: false, reasons: ['invalid pose'] };
    const bounds = vehicleBounds(pose, VEHICLE.clearanceMargin, VEHICLE.launchForward, VEHICLE.launchReverse);
    // Roundoff from upright quaternion transforms can put this conservative box micrometres below 0.
    bounds.minimumY = Math.max(0, bounds.minimumY);
    const clearance = physical.clearance(bounds, VEHICLE.boundaryMargin);
    const reasons: string[] = [...clearance.reasons];
    if (!pavement.covers(pavementRectangle(pose, VEHICLE.launchForward, VEHICLE.launchReverse))) reasons.push('pavement');
    return { clear: reasons.length === 0, reasons };
  };
  return {
    validate, pavement,
    find() {
      const nodes = new Map(artifact.streetGraph.nodes.map(n => [n.id, n.position]));
      // Prefer long segments near cell centre; IDs are only deterministic tie-breakers, never city rules.
      const edges = artifact.streetGraph.edges.flatMap(edge => {
        const a = nodes.get(edge.from), b = nodes.get(edge.to);
        if (!a || !b) return [];
        const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
        if (!Number.isFinite(length) || length < 1) return [];
        return [{ a, b, yaw: Math.atan2(dx, dz), length, id: edge.id, distance: Math.hypot((a[0] + b[0]) / 2, (a[2] + b[2]) / 2) }];
      }).sort((a, b) => b.length - a.length || a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const rejections: Record<string, number> = {};
      let attempts = 0;
      for (const fraction of [0.5, 0.25, 0.75]) for (const edge of edges) {
        if (attempts >= VEHICLE.maximumCandidates) return { attempts, rejections };
        const pose = yawPose(edge.a[0] + (edge.b[0] - edge.a[0]) * fraction, edge.a[2] + (edge.b[2] - edge.a[2]) * fraction, edge.yaw);
        attempts++;
        const result = validate(pose);
        if (result.clear) return { pose, attempts, rejections };
        for (const reason of result.reasons) rejections[reason] = (rejections[reason] ?? 0) + 1;
      }
      return { attempts, rejections };
    }
  };
}
