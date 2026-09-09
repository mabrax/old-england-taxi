import { beforeAll, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createChaseCamera, CAMERA_RADIUS } from '../src/lib/scene/chase-camera';
import { createPhysicalWorld, initializeRapier } from '../src/lib/physics/physical-world';
import { yawPose } from '../src/lib/physics/vehicle-config';
import { physicalFixture } from './helpers/physical-fixture';

beforeAll(initializeRapier);
describe('chase camera clearance and motion', () => {
  it('follows translation/reverse without swapping sides; reset snaps and ignores stale elapsed time', () => {
    const camera = new PerspectiveCamera(); const chase = createChaseCamera(camera, () => 1);
    const start = chase.update(yawPose(0, 0, 0), 0);
    for (let z = 0; z > -10; z--) chase.update(yawPose(0, z, 0), 1 / 60);
    expect(camera.position.z).toBeLessThan(-9); expect(camera.position.y).toBeGreaterThan(5);
    chase.reset(); const reset = chase.update(yawPose(0, 0, 0), 10000);
    expect(reset.position).toEqual(start.position);
  });
  it('turns across the heading wrap using a short arc and remains upright after an overturned pose', () => {
    const camera = new PerspectiveCamera(); const chase = createChaseCamera(camera, () => 1);
    chase.update(yawPose(0, 0, Math.PI - 0.02), 0);
    const previous = camera.position.clone(); chase.update(yawPose(0, 0, -Math.PI + 0.02), 1 / 60);
    expect(previous.distanceTo(camera.position)).toBeLessThan(0.1);
    chase.update({ position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 1, w: 0 } }, 1 / 60);
    expect(camera.up.y).toBe(1); expect(camera.position.y).toBeGreaterThan(1);
  });
  it('sweeps actual near-wall/corner/courtyard geometry and stays clear after smoothing', () => {
    const physical = createPhysicalWorld(physicalFixture());
    try {
      for (const [x, z, yaw] of [[0, -12, 0], [12, 12, -Math.PI / 4], [0, 0, 0], [-12, 0, Math.PI / 2]]) {
        const camera = new PerspectiveCamera();
        const chase = createChaseCamera(camera, physical.cameraSweep);
        for (let i = 0; i < 120; i++) {
          const result = chase.update(yawPose(x, z, yaw + i * 0.001), 1 / 60);
          expect(physical.cameraSweep(new Vector3(...result.target), camera.position, CAMERA_RADIUS)).toBe(1);
          expect(camera.position.y).toBeGreaterThan(CAMERA_RADIUS);
        }
      }
    } finally { physical.dispose(); }
  });
  it('retracts immediately at a wall and uses overhead clearance when rear space is too short', () => {
    const physical = createPhysicalWorld(physicalFixture());
    try {
      const camera = new PerspectiveCamera(); const chase = createChaseCamera(camera, physical.cameraSweep);
      const result = chase.update(yawPose(0, -11.1, Math.PI), 0);
      expect(result.occluded).toBe(true); expect(result.overhead).toBe(true);
      expect(camera.position.y).toBeGreaterThan(8);
      for (let i=0;i<240;i++) expect(chase.update(yawPose(0,-11.1,Math.PI),1/60).overhead).toBe(true);
      expect(physical.cameraSweep(new Vector3(...result.target), camera.position, CAMERA_RADIUS)).toBe(1);
    } finally { physical.dispose(); }
  });
  it('ground sweep protects the whole camera volume and ignores the dynamic chassis', () => {
    const physical = createPhysicalWorld(physicalFixture());
    try {
      const from = { x: 0, y: 3, z: -20 }, to = { x: 0, y: -3, z: -20 };
      const fraction = physical.cameraSweep(from, to, CAMERA_RADIUS);
      expect(fraction).toBeGreaterThan(0.4); expect(fraction).toBeLessThan(0.45);
      const body = physical.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 3, -20));
      physical.world.createCollider(RAPIER.ColliderDesc.ball(1), body); physical.step();
      expect(physical.cameraSweep(from, { x: 0, y: 8, z: -20 }, CAMERA_RADIUS)).toBe(1);
    } finally { physical.dispose(); }
  });
});
