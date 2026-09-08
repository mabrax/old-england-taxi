import { NEUTRAL, VEHICLE, type Pose, type VehicleCommand } from '../physics/vehicle-config';
import type { FirstVehicle } from '../physics/vehicle';
import type { PhysicsStepDriver } from '../physics/physics-session';

export interface BenchmarkFixture {
  version: 1; id: string; artifact: { id: string; sha256: string }; startPose: Pose;
  stepMs: number; maxCatchUpSteps: number; warmupSteps: number; measuredSteps: number;
  vehicle: typeof VEHICLE; viewport: { width: number; height: number; deviceScaleFactor: number };
  commands: [number, number, number][];
  checkpoints: (Pose & { step: number; speed: number })[];
  tolerances: { positionMetres: number; rotationRadians: number; speedMetresPerSecond: number };
}
export type BenchmarkPhase = 'ready' | 'warmup' | 'measuring' | 'complete' | 'invalid';
export function validateFixture(f: BenchmarkFixture) {
  if (f.version !== 1 || f.stepMs !== 1000 / 60 || f.maxCatchUpSteps !== 5 ||
      f.warmupSteps !== 300 || f.measuredSteps !== 7200 || f.commands.length !== f.measuredSteps ||
      JSON.stringify(f.vehicle) !== JSON.stringify(VEHICLE)) throw new Error('Benchmark configuration mismatch; use a separately versioned fixture');
  for (const c of f.commands) if (c.length !== 3 || !c.every(Number.isFinite) || Math.abs(c[0]) > 1 || Math.abs(c[1]) > 1 || c[2] < 0 || c[2] > 1) throw new Error('Invalid benchmark command');
  if (f.checkpoints.length !== (f.warmupSteps + f.measuredSteps) / 60 ||
      f.checkpoints.some((p, i) => p.step !== (i + 1) * 60 || ![...Object.values(p.position), ...Object.values(p.rotation), p.speed].every(Number.isFinite))) throw new Error('Invalid benchmark checkpoints');
  if (!Object.values(f.tolerances).every(n => Number.isFinite(n) && n > 0)) throw new Error('Invalid benchmark tolerances');
}

/** A fixed command tape; no path search, pose override or DOM work in its step callbacks. */
export function createBenchmarkReplay(fixture: BenchmarkFixture, now = () => performance.now(), mark: (name: string) => void = () => {}) {
  validateFixture(fixture);
  let phase: BenchmarkPhase = 'ready', step = 0, pendingComplete = false;
  let startedAt: number | null = null, measureStartedAt: number | null = null, endedAt: number | null = null;
  let failure: string | null = null;
  const checkpoints: { step: number; atMs: number; positionError: number; rotationError: number; speedError: number }[] = [];
  const invalidate = (reason: string) => {
    if (phase === 'complete' || phase === 'invalid' || phase === 'ready') return;
    failure = reason; phase = 'invalid'; endedAt = now(); mark('benchmark:invalid');
  };
  const driver: PhysicsStepDriver = {
    startPose: fixture.startPose,
    beforeStep() {
      if (!['warmup', 'measuring'].includes(phase) || pendingComplete) return null;
      if (step === fixture.warmupSteps) { phase = 'measuring'; measureStartedAt = now(); mark('benchmark:measure-start'); }
      if (step < fixture.warmupSteps) return NEUTRAL;
      const [throttle, steering, brake] = fixture.commands[step - fixture.warmupSteps];
      return { throttle, steering, brake } satisfies VehicleCommand;
    },
    afterStep(vehicle: FirstVehicle) {
      step++;
      if (vehicle.state.recoveries || vehicle.state.resets) { invalidate('Unexpected recovery or reset'); return; }
      if (step % 60 === 0) {
        const expected = fixture.checkpoints[step / 60 - 1], actual = vehicle.frames.current!;
        const positionError = Math.hypot(actual.position.x - expected.position.x, actual.position.y - expected.position.y, actual.position.z - expected.position.z);
        const a = actual.rotation, b = expected.rotation;
        const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w) / (Math.hypot(a.x, a.y, a.z, a.w) * Math.hypot(b.x, b.y, b.z, b.w));
        const rotationError = 2 * Math.acos(Math.min(1, dot)), speedError = Math.abs(vehicle.speed - expected.speed);
        checkpoints.push({ step, atMs: now(), positionError, rotationError, speedError });
        const t = fixture.tolerances;
        if (![positionError, rotationError, speedError].every(Number.isFinite) || positionError > t.positionMetres || rotationError > t.rotationRadians || speedError > t.speedMetresPerSecond) invalidate(`Trajectory diverged at step ${step}`);
      }
      if (step === fixture.warmupSteps + fixture.measuredSteps && phase === 'measuring') pendingComplete = true;
      return !pendingComplete && phase !== 'invalid';
    }
  };
  return {
    driver, get active() { return phase === 'warmup' || phase === 'measuring'; },
    get pendingComplete() { return pendingComplete; },
    start() {
      if (phase !== 'ready') throw new Error('Benchmark is one-shot; reload for a fresh run');
      startedAt = now(); phase = 'warmup'; mark('benchmark:warmup-start');
    },
    invalidate,
    afterFrame() {
      if (pendingComplete && phase === 'measuring') { phase = 'complete'; endedAt = now(); mark('benchmark:measure-end'); }
    },
    snapshot() {
      return { version: 1, id: fixture.id, phase, step, startedAt, measureStartedAt, endedAt, failure,
        expectedSteps: fixture.warmupSteps + fixture.measuredSteps, measuredSimulationMs: Math.max(0, step - fixture.warmupSteps) * fixture.stepMs,
        measuredWallMs: measureStartedAt === null || endedAt === null ? null : endedAt - measureStartedAt,
        checkpoints: checkpoints.map(p => ({ ...p })), accepted: phase === 'complete' && !failure };
    }
  };
}
export type BenchmarkReplay = ReturnType<typeof createBenchmarkReplay>;
declare global {
  interface Window {
    __drivingBenchmark?: { start: () => void; snapshot: BenchmarkReplay['snapshot'] };
  }
}
