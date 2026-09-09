/** Metres, kilograms, seconds. Local +Z is forward, +X left, +Y up; positive steering turns left. */
export const VEHICLE = Object.freeze({
  halfWidth: 1, halfHeight: 0.45, halfLength: 2.2, mass: 1100,
  wheelX: 0.72, wheelZ: 1.35, connectionY: -0.1, wheelRadius: 0.32, wheelWidth: 0.22,
  suspensionRest: 0.45, suspensionTravel: 0.15, suspensionStiffness: 35,
  suspensionCompression: 4.4, suspensionRelaxation: 5.2, maxSuspensionForce: 12000,
  frictionSlip: 1.4, sideFriction: 1, engineForce: 900, brakeImpulse: 35,
  forwardLimit: 8, reverseLimit: 3, steeringLimit: 0.4, steeringRate: 1.2,
  stopSpeed: 0.08, linearDamping: 0.12, angularDamping: 1,
  clearanceMargin: 0.15, launchForward: 6, launchReverse: 3, boundaryMargin: 10,
  contactTolerance: 0.03, recoveryMargin: 0.5, maximumCandidates: 256
});
export interface Vec3 { x: number; y: number; z: number }
export interface Rotation extends Vec3 { w: number }
export interface Pose { position: Vec3; rotation: Rotation }
export interface VehicleCommand { throttle: number; steering: number; brake: number }
export const NEUTRAL: Readonly<VehicleCommand> = Object.freeze({ throttle: 0, steering: 0, brake: 0 });
export const WHEEL_CONNECTIONS = Object.freeze([
  { x: -VEHICLE.wheelX, y: VEHICLE.connectionY, z: VEHICLE.wheelZ },
  { x: VEHICLE.wheelX, y: VEHICLE.connectionY, z: VEHICLE.wheelZ },
  { x: -VEHICLE.wheelX, y: VEHICLE.connectionY, z: -VEHICLE.wheelZ },
  { x: VEHICLE.wheelX, y: VEHICLE.connectionY, z: -VEHICLE.wheelZ }
]);
export const SPAWN_Y = -VEHICLE.connectionY + VEHICLE.suspensionRest + VEHICLE.suspensionTravel + VEHICLE.wheelRadius;
export function rotate(p: Vec3, q: Rotation): Vec3 {
  const tx = 2 * (q.y * p.z - q.z * p.y), ty = 2 * (q.z * p.x - q.x * p.z), tz = 2 * (q.x * p.y - q.y * p.x);
  return { x: p.x + q.w * tx + q.y * tz - q.z * ty, y: p.y + q.w * ty + q.z * tx - q.x * tz, z: p.z + q.w * tz + q.x * ty - q.y * tx };
}
export function transform(p: Vec3, pose: Pose): Vec3 {
  const v = rotate(p, pose.rotation);
  return { x: v.x + pose.position.x, y: v.y + pose.position.y, z: v.z + pose.position.z };
}
export function yawPose(x: number, z: number, yaw: number): Pose {
  return { position: { x, y: SPAWN_Y, z }, rotation: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) } };
}
