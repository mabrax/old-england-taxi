import { rotate, type Vec3, type Pose } from '../../src/lib/physics/vehicle-config';

/** Independent 15-axis OBB SAT. Non-overlap is zero; otherwise minimum translation depth.
 * Used only by evidence, because narrow-phase distance queries against very long thin
 * cuboids can return inaccurate witness points. Never changes the physics world.
 */
export function boxPenetration(a: Pose, ah: Vec3, b: Pose, bh: Vec3) {
  const dot = (u: Vec3, v: Vec3) => u.x*v.x + u.y*v.y + u.z*v.z;
  const unit = [{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}];
  const aa = unit.map(v=>rotate(v,a.rotation)), bb = unit.map(v=>rotate(v,b.rotation));
  const axes = [...aa,...bb];
  for (const u of aa) for (const v of bb) axes.push({x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x});
  const delta = {x:a.position.x-b.position.x,y:a.position.y-b.position.y,z:a.position.z-b.position.z};
  let depth = Infinity;
  for (const axis of axes) {
    const length = Math.hypot(axis.x,axis.y,axis.z);
    if (length < 1e-8) continue;
    const n = {x:axis.x/length,y:axis.y/length,z:axis.z/length};
    const radius = (basis: Vec3[], half: Vec3) => Math.abs(dot(n,basis[0]))*half.x + Math.abs(dot(n,basis[1]))*half.y + Math.abs(dot(n,basis[2]))*half.z;
    const overlap = radius(aa,ah)+radius(bb,bh)-Math.abs(dot(delta,n));
    if (overlap <= 0) return 0;
    depth = Math.min(depth,overlap);
  }
  return depth;
}
