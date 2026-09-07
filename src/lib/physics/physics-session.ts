import type { FirstVehicle, VehicleState } from './vehicle';
import type { VehicleCommand } from './vehicle-config';
import type { ZoneArtifact } from '../zone/types';
import type { PhysicalWorld, WorldMetrics } from './physical-world';

export const STEP_MS = 1000 / 60;
export const MAX_CATCH_UP_STEPS = 5;
export const PHYSICS_INIT_TIMEOUT_MS = 30_000;
export type PhysicsStatus = 'loading' | 'paused' | 'running' | 'error' | 'disposed';
export interface PhysicsState { status: PhysicsStatus; message?: string; metrics?: WorldMetrics; initializationMs?: number; vehicle?: VehicleState }
type PhysicsModule = Pick<typeof import('./physical-world'), 'initializeRapier' | 'createPhysicalWorld'> & { createVehicle?: typeof import('./vehicle').createVehicle };

/** No loop or DOM ownership here: the scene drives frames and visibility, and disposes once. */
export function createPhysicsSession(
  artifact: ZoneArtifact,
  onState: (state: PhysicsState) => void,
  load: () => Promise<PhysicsModule> = () => import('./vehicle')
) {
  let physical: PhysicalWorld | undefined;
  let vehicle: FirstVehicle | undefined;
  let state: PhysicsState = { status: 'loading' };
  const isLoading = () => state.status === 'loading';
  let previous: number | undefined;
  let accumulator = 0;
  let commandSteps = 0;
  const timing = { steps: 0, droppedMs: 0, totalStepMs: 0, maximumStepMs: 0 };
  const resetClock = () => { previous = undefined; accumulator = 0; };
  const publish = (next: PhysicsState) => {
    if (vehicle && physical && next.metrics) next = { ...next, metrics: { ...next.metrics, colliders: physical.world.colliders.len(), rigidBodies: physical.world.bodies.len() } };
    state = next; onState(next);
  };
  const fail = (error: unknown) => {
    if (state.status === 'disposed') return;
    vehicle?.dispose(); vehicle = undefined; physical?.dispose(); physical = undefined; resetClock();
    const message = error instanceof Error ? error.message : 'Physical world could not be initialized.';
    publish({ status: 'error', message: /dynamically imported module|Importing a module script failed|Loading chunk/i.test(message)
      ? 'The physics engine could not be loaded. Reload to retry.' : message });
  };
  const started = performance.now();
  // Begin in a microtask so synchronous loaders/callbacks cannot escape cleanup ownership.
  let stopWaiting!: () => void;
  const cancelled = new Promise<void>(resolve => { stopWaiting = resolve; });
  let deadline: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    deadline = setTimeout(() => reject(new Error('Physical world initialization timed out. Reload to retry.')), PHYSICS_INIT_TIMEOUT_MS);
  });
  const initializing = Promise.resolve().then(load).then(async module => {
    if (!isLoading()) return;
    await module.initializeRapier();
    if (!isLoading()) return;
    physical = module.createPhysicalWorld(artifact);
    vehicle = module.createVehicle?.(physical, artifact);
    publish({ status: 'paused', metrics: { ...physical.metrics, ...(vehicle ? { colliders: physical.world.colliders.len(), rigidBodies: physical.world.bodies.len() } : {}) }, vehicle: vehicle?.state, initializationMs: performance.now() - started });
  });
  const ready = Promise.race([initializing, timeout, cancelled]).catch(fail).finally(() => clearTimeout(deadline));
  return {
    ready, timing,
    get state() { return state; },
    get physical() { return physical; },
    get vehicle() { return vehicle; },
    exercise(command: VehicleCommand, steps = 60) {
      if (!vehicle || !['paused', 'running'].includes(state.status) || !Number.isInteger(steps) || steps < 1 || steps > 600) return false;
      resetClock(); vehicle.submit({ throttle: 0, steering: 0, brake: 0 });
      if (!vehicle.submit(command)) return false;
      commandSteps = steps; publish({ ...state, status: 'running' }); return true;
    },
    get alpha() { return state.status === 'running' ? accumulator / STEP_MS : 1; },
    submit(command: VehicleCommand) { return state.status === 'running' && !!vehicle?.submit(command); },
    resetVehicle() {
      if (!vehicle) return;
      resetClock(); commandSteps = 0;
      try { vehicle.reset(); publish({ ...state, status: 'paused', vehicle: vehicle.state }); } catch (error) { fail(error); }
    },
    pause() {
      vehicle?.clearInput(); commandSteps = 0;
      resetClock();
      if (state.status === 'running') publish({ ...state, status: 'paused', vehicle: vehicle?.state });
    },
    resume() {
      if (state.status !== 'paused') return;
      resetClock(); publish({ ...state, status: 'running' });
    },
    advance(now: number) {
      if (state.status !== 'running' || !physical) return;
      if (!Number.isFinite(now)) { resetClock(); return; }
      if (previous === undefined) { previous = now; return; }
      const elapsed = Math.max(0, now - previous);
      previous = now;
      const budget = MAX_CATCH_UP_STEPS * STEP_MS;
      timing.droppedMs += Math.max(0, accumulator + elapsed - budget);
      accumulator = Math.min(accumulator + elapsed, budget);
      try {
        for (let steps = 0; steps < MAX_CATCH_UP_STEPS && accumulator + 1e-8 >= STEP_MS; steps++) {
          const start = performance.now();
          vehicle?.beforeStep();
          physical.step();
          vehicle?.afterStep();
          if (vehicle && (vehicle.state.recoveries !== state.vehicle?.recoveries || vehicle.state.status !== state.vehicle?.status)) {
            vehicle.clearInput(); commandSteps = 0; resetClock();
            publish({ ...state, status: 'paused', vehicle: vehicle.state });
            timing.steps++; break;
          }
          const duration = performance.now() - start;
          timing.totalStepMs += duration;
          timing.maximumStepMs = Math.max(timing.maximumStepMs, duration);
          timing.steps++;
          accumulator = Math.max(0, accumulator - STEP_MS);
          if (commandSteps > 0 && --commandSteps === 0) {
            vehicle?.clearInput(); resetClock(); publish({ ...state, status: 'paused', vehicle: vehicle?.state }); break;
          }
        }
      } catch (error) { fail(error); }
    },
    fail,
    dispose() {
      if (state.status === 'disposed') return;
      state = { status: 'disposed' }; // Do not notify an unmounted UI.
      clearTimeout(deadline); stopWaiting();
      resetClock(); vehicle?.dispose(); vehicle = undefined; physical?.dispose(); physical = undefined;
    }
  };
}
