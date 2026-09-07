import RAPIER from '@dimforge/rapier3d-compat';
import type { ZoneArtifact } from '../zone/types';
import { FIXED_STEP_SECONDS, type PhysicalWorld } from './physical-world';
import { containsBox } from './world-geometry';
import { createSpawnSearch, vehicleBounds } from './vehicle-spawn';
import { NEUTRAL, VEHICLE, WHEEL_CONNECTIONS, rotate, transform, type Pose, type VehicleCommand } from './vehicle-config';
export { initializeRapier, createPhysicalWorld } from './physical-world';
export interface VehicleSnapshot extends Pose { wheels: { length: number; steering: number; rotation: number }[] }
export interface VehicleState { status: 'ready' | 'unavailable'; message: string; resets: number; recoveries: number; inputReady: boolean }

/** The session owns this controller and calls beforeStep -> world.step -> afterStep at 60 Hz. */
export function createVehicle(physical: PhysicalWorld, artifact: ZoneArtifact) {
  const search = createSpawnSearch(artifact, physical);
  const start = search.find();
  let body: RAPIER.RigidBody | undefined;
  let controller: RAPIER.DynamicRayCastVehicleController | undefined;
  let previous: VehicleSnapshot | undefined, current: VehicleSnapshot | undefined;
  let command: VehicleCommand = { ...NEUTRAL };
  let steering = 0, disposed = false, armed = true, resets = 0, recoveries = 0;
  let message = start.pose ? 'Vehicle ready. Physics starts paused.' : `Driving unavailable: no safe paved start in ${start.attempts} candidates (${Object.keys(start.rejections).join(', ') || 'no usable graph hints'}). Inspection remains available.`;
  const remove = () => {
    if (controller) { physical.world.removeVehicleController(controller); controller = undefined; }
    if (body) { physical.world.removeRigidBody(body); body = undefined; }
    previous = current = undefined;
  };
  const pose = (): Pose => ({ position: { ...body!.translation() }, rotation: { ...body!.rotation() } });
  const snapshot = (): VehicleSnapshot => {
    const p = pose();
    const direction = rotate({ x: 0, y: -1, z: 0 }, p.rotation);
    const wheels = WHEEL_CONNECTIONS.map((connection, i) => {
      // Recast at the POST-step pose for render alignment, without applying another suspension impulse.
      const hit = physical.world.castRay(new RAPIER.Ray(transform(connection, p), direction),
        VEHICLE.suspensionRest + VEHICLE.suspensionTravel + VEHICLE.wheelRadius, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
      const length = hit ? Math.max(VEHICLE.suspensionRest - VEHICLE.suspensionTravel, hit.timeOfImpact - VEHICLE.wheelRadius) : VEHICLE.suspensionRest + VEHICLE.suspensionTravel;
      return { length, steering: controller!.wheelSteering(i) ?? 0, rotation: controller!.wheelRotation(i) ?? 0 };
    });
    return { ...p, wheels };
  };
  const build = () => {
    const p = start.pose!;
    try {
      body = physical.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.position.x, p.position.y, p.position.z)
        .setRotation(p.rotation).setCcdEnabled(true).setCanSleep(false).setAdditionalSolverIterations(4)
        .setLinearDamping(VEHICLE.linearDamping).setAngularDamping(VEHICLE.angularDamping));
      physical.world.createCollider(RAPIER.ColliderDesc.cuboid(VEHICLE.halfWidth, VEHICLE.halfHeight, VEHICLE.halfLength)
        .setMass(VEHICLE.mass).setFriction(0).setRestitution(0).setContactSkin(0.005), body);
      controller = physical.world.createVehicleController(body);
      controller.indexUpAxis = 1;
      controller.setIndexForwardAxis = 2; // 0.20.0 exposes a setter named setIndexForwardAxis.
      for (const [i, connection] of WHEEL_CONNECTIONS.entries()) {
        controller.addWheel(connection, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, VEHICLE.suspensionRest, VEHICLE.wheelRadius);
        controller.setWheelMaxSuspensionTravel(i, VEHICLE.suspensionTravel);
        controller.setWheelSuspensionStiffness(i, VEHICLE.suspensionStiffness);
        controller.setWheelSuspensionCompression(i, VEHICLE.suspensionCompression);
        controller.setWheelSuspensionRelaxation(i, VEHICLE.suspensionRelaxation);
        controller.setWheelMaxSuspensionForce(i, VEHICLE.maxSuspensionForce);
        controller.setWheelFrictionSlip(i, VEHICLE.frictionSlip);
        controller.setWheelSideFrictionStiffness(i, VEHICLE.sideFriction);
      }
      previous = current = snapshot();
    } catch (error) { remove(); throw error; }
  };
  const clearInput = (synchronize = true) => {
    command = { ...NEUTRAL }; steering = 0; armed = false;
    if (controller) for (let i = 0; i < 4; i++) {
      controller.setWheelEngineForce(i, 0); controller.setWheelBrake(i, 0); controller.setWheelSteering(i, 0);
    }
    // A pause snaps interpolation to the latest physical pose, never an old partial frame.
    if (body && synchronize) previous = current = snapshot();
  };
  const reset = (automatic = false) => {
    if (disposed) return false;
    clearInput(false);
    if (automatic) recoveries++; else resets++;
    remove();
    if (!start.pose || !search.validate(start.pose).clear) {
      message = 'Driving unavailable: the starting area no longer passes safety checks. Inspection remains available.';
      return false;
    }
    // Recreate both dynamic resources, clearing forces, velocities, contacts and every internal wheel state.
    build();
    message = automatic ? 'Vehicle recovered from an escaped, fallen or invalid state. Send neutral before driving.' : 'Vehicle reset to the revalidated start. Send neutral before driving.';
    return true;
  };
  const invalid = () => {
    const p = pose(), velocity = body!.linvel(), angular = body!.angvel();
    if (![...Object.values(p.position), ...Object.values(p.rotation), ...Object.values(velocity), ...Object.values(angular)].every(Number.isFinite) ||
      Math.abs(Math.hypot(...Object.values(p.rotation)) - 1) > 0.01) return true;
    const box = vehicleBounds(p), e = physical.envelope, m = VEHICLE.recoveryMargin;
    return !containsBox({ minimumX: e.minimumX - m, maximumX: e.maximumX + m, minimumZ: e.minimumZ - m, maximumZ: e.maximumZ + m }, box) || box.minimumY < -2 || box.maximumY > 20;
  };
  const speed = () => {
    if (!body) return 0;
    const v = body.linvel(), f = rotate({ x: 0, y: 0, z: 1 }, body.rotation());
    return v.x * f.x + v.y * f.y + v.z * f.z;
  };
  const limitSpeed = () => {
    const v = body!.linvel(), horizontal = Math.hypot(v.x, v.z);
    const limit = speed() < -VEHICLE.stopSpeed ? VEHICLE.reverseLimit : VEHICLE.forwardLimit;
    if (horizontal > limit) body!.setLinvel({ x: v.x * limit / horizontal, y: v.y, z: v.z * limit / horizontal }, true);
  };
  if (start.pose) build();
  return {
    start,
    get body() { return body; },
    get controller() { return controller; },
    get state(): VehicleState { return { status: body ? 'ready' : 'unavailable', message, resets, recoveries, inputReady: armed }; },
    get speed() { return speed(); },
    get frames() { return { previous, current }; },
    clearInput, reset,
    submit(input: VehicleCommand) {
      if (disposed || !body) return false;
      if (!input || ![input.throttle, input.steering, input.brake].every(Number.isFinite)) { clearInput(); return false; }
      const next = { throttle: Math.max(-1, Math.min(1, input.throttle)), steering: Math.max(-1, Math.min(1, input.steering)), brake: Math.max(0, Math.min(1, input.brake)) };
      if (!armed) {
        if (next.throttle !== 0 || next.steering !== 0 || next.brake !== 0) return false;
        armed = true;
      }
      command = next; return true;
    },
    beforeStep() {
      if (disposed || !body || !controller) return;
      // Never send NaN to WASM. External corruption is recovered before the next world step too.
      if (invalid()) { reset(true); return; }
      previous = current;
      const v = speed();
      const changingDirection = command.throttle !== 0 && Math.sign(command.throttle) * v < -VEHICLE.stopSpeed;
      const brake = changingDirection ? 1 : command.brake;
      const engine = brake > 0 ? 0 : command.throttle * VEHICLE.engineForce;
      const target = command.steering * VEHICLE.steeringLimit;
      steering += Math.max(-VEHICLE.steeringRate * FIXED_STEP_SECONDS, Math.min(VEHICLE.steeringRate * FIXED_STEP_SECONDS, target - steering));
      for (let i = 0; i < 4; i++) {
        controller.setWheelSteering(i, i < 2 ? steering : 0);
        controller.setWheelEngineForce(i, engine);
        controller.setWheelBrake(i, brake * VEHICLE.brakeImpulse);
      }
      controller.updateVehicle(FIXED_STEP_SECONDS, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
      if (brake > 0 && Math.abs(v) < VEHICLE.stopSpeed && Math.hypot(body.linvel().x, body.linvel().z) < VEHICLE.stopSpeed &&
          [0, 1, 2, 3].every(i => controller!.wheelIsInContact(i))) {
        body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
      }
      limitSpeed();
    },
    afterStep() {
      if (disposed || !body) return;
      if (invalid()) { reset(true); return; }
      limitSpeed(); current = snapshot();
    },
    dispose() { if (disposed) return; disposed = true; remove(); }
  };
}
export type FirstVehicle = ReturnType<typeof createVehicle>;
