import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { Pose, Vec3 } from '../physics/vehicle-config';

export const CAMERA_RADIUS = 0.35;
export type CameraSweep = (from: Vec3, to: Vec3, radius: number) => number;

/** The sweep returns a safe segment fraction. Always query AFTER smoothing, so lag cannot cross a wall. */
export function createChaseCamera(camera: PerspectiveCamera, sweep: CameraSweep) {
  const target = new Vector3(), desired = new Vector3(), position = new Vector3();
  const forward = new Vector3(0, 0, 1), rotation = new Quaternion();
  let initialized = false, yaw = 0, wasOverhead = false;
  const constrain = (point: Vector3) => {
    point.y = Math.max(CAMERA_RADIUS + 0.1, point.y);
    const fraction = Math.max(0, Math.min(1, sweep(target, point, CAMERA_RADIUS)));
    point.lerpVectors(target, point, fraction);
    return fraction;
  };
  return {
    reset() { initialized = false; wasOverhead = false; },
    update(pose: Pose, seconds: number) {
      rotation.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
      forward.set(0, 0, 1).applyQuaternion(rotation);
      const heading = Math.hypot(forward.x, forward.z) > 0.1 ? Math.atan2(forward.x, forward.z) : yaw;
      const blend = 1 - Math.exp(-8 * Math.max(0, Math.min(0.1, seconds)));
      const delta = Math.atan2(Math.sin(heading - yaw), Math.cos(heading - yaw));
      yaw = initialized ? yaw + delta * blend : heading;
      target.set(pose.position.x, Math.max(0.9, pose.position.y + 0.35), pose.position.z);
      desired.set(target.x - Math.sin(yaw) * 9, target.y + 5.5, target.z - Math.cos(yaw) * 9);
      // Choose the view from the ideal rear clearance, never from its previous smoothed position.
      // Otherwise a close wall alternates between an overhead jump and a retracted rear view.
      const rearFraction = constrain(desired);
      let overhead = desired.distanceTo(target) < (wasOverhead ? 3.8 : 3.2);
      if (overhead) desired.copy(target).add(new Vector3(0, 8, -0.01));
      if (initialized && overhead === wasOverhead) position.lerp(desired, blend); else position.copy(desired);
      let fraction = constrain(position);
      if (position.distanceTo(target) < 3) {
        position.copy(target).add(new Vector3(0, 8, -0.01));
        fraction = constrain(position); overhead = true;
      }
      wasOverhead = overhead;
      camera.position.copy(position);
      camera.up.set(Math.sin(yaw) * (overhead ? 1 : 0), overhead ? 0 : 1, Math.cos(yaw) * (overhead ? 1 : 0));
      camera.lookAt(target); camera.updateMatrixWorld();
      initialized = true;
      return { target: target.toArray(), position: position.toArray(), occluded: rearFraction < 1 || fraction < 1 || overhead, overhead };
    }
  };
}
