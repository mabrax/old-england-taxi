import type { ZoneArtifact } from '../zone/types';
import type { PhysicalWorld, WorldMetrics } from './physical-world';

export const STEP_MS = 1000 / 60;
export const MAX_CATCH_UP_STEPS = 5;
export const PHYSICS_INIT_TIMEOUT_MS = 30_000;
export type PhysicsStatus = 'loading' | 'paused' | 'running' | 'error' | 'disposed';
export interface PhysicsState { status: PhysicsStatus; message?: string; metrics?: WorldMetrics; initializationMs?: number }
type PhysicsModule = Pick<typeof import('./physical-world'), 'initializeRapier' | 'createPhysicalWorld'>;

/** No loop or DOM ownership here: the scene drives frames and visibility, and disposes once. */
export function createPhysicsSession(
  artifact: ZoneArtifact,
  onState: (state: PhysicsState) => void,
  load: () => Promise<PhysicsModule> = () => import('./physical-world')
) {
  let physical: PhysicalWorld | undefined;
  let state: PhysicsState = { status: 'loading' };
  const isLoading = () => state.status === 'loading';
  let previous: number | undefined;
  let accumulator = 0;
  const timing = { steps: 0, droppedMs: 0, totalStepMs: 0, maximumStepMs: 0 };
  const resetClock = () => { previous = undefined; accumulator = 0; };
  const publish = (next: PhysicsState) => { state = next; onState(next); };
  const fail = (error: unknown) => {
    if (state.status === 'disposed') return;
    physical?.dispose(); physical = undefined; resetClock();
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
    publish({ status: 'paused', metrics: physical.metrics, initializationMs: performance.now() - started });
  });
  const ready = Promise.race([initializing, timeout, cancelled]).catch(fail).finally(() => clearTimeout(deadline));
  return {
    ready, timing,
    get state() { return state; },
    get physical() { return physical; },
    pause() {
      resetClock();
      if (state.status === 'running') publish({ ...state, status: 'paused' });
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
          physical.step();
          const duration = performance.now() - start;
          timing.totalStepMs += duration;
          timing.maximumStepMs = Math.max(timing.maximumStepMs, duration);
          timing.steps++;
          accumulator = Math.max(0, accumulator - STEP_MS);
        }
      } catch (error) { fail(error); }
    },
    fail,
    dispose() {
      if (state.status === 'disposed') return;
      state = { status: 'disposed' }; // Do not notify an unmounted UI.
      clearTimeout(deadline); stopWaiting();
      resetClock(); physical?.dispose(); physical = undefined;
    }
  };
}
