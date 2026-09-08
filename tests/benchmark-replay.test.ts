import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createBenchmarkReplay, matchesBenchmarkViewport, validateFixture, type BenchmarkFixture } from '../src/lib/benchmark/replay';
import { createPhysicsSession } from '../src/lib/physics/physics-session';
import * as physics from '../src/lib/physics/vehicle';
import type { ZoneArtifact } from '../src/lib/zone/types';
import { BENCHMARK } from '../src/lib/benchmark/load-fixture';
const bytes = readFileSync('public/benchmarks/chicago-loop-v1.json');
const fixture = JSON.parse(bytes.toString()) as BenchmarkFixture;
const artifactBytes = readFileSync(`public/zones/${fixture.artifact.id}.zone.json`);
const artifact = JSON.parse(artifactBytes.toString()) as ZoneArtifact;
beforeAll(physics.initializeRapier);
async function session(f = fixture) {
  let now = 0;
  const replay = createBenchmarkReplay(f, () => now);
  const s = createPhysicsSession(artifact, () => {}, async () => physics, undefined, replay.driver);
  await s.ready;
  return { replay, s, tick: (at: number) => { now = at; s.advance(at); replay.afterFrame(); } };
}
describe('frozen performance workload', () => {
  it('accepts only display-scale representation noise, not different viewports', () => {
    expect(matchesBenchmarkViewport(fixture.viewport, 1440, 900, 1.0000000298023224)).toBe(true);
    for (const args of [[1441, 900, 1], [1440, 901, 1], [1440, 900, 1.001], [1440, 900, NaN]]) {
      expect(matchesBenchmarkViewport(fixture.viewport, args[0], args[1], args[2])).toBe(false);
    }
  });
  it('pins the checked-in tape and original map bytes', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(BENCHMARK.sha256);
    expect(createHash('sha256').update(artifactBytes).digest('hex')).toBe(fixture.artifact.sha256);
  });
  it('replays the entire route through real physics at different render cadences', async () => {
    const positions = [];
    for (const hz of [30, 60, 144]) {
      const { s, replay, tick } = await session();
      try {
        s.resume(); replay.start(); tick(0);
        for (let frame = 1; frame <= hz * 126 && replay.active; frame++) tick(frame * 1000 / hz);
        const result = replay.snapshot();
        expect(result.failure).toBeNull(); expect(result.accepted).toBe(true);
        expect(s.timing.steps).toBe(7500); expect(s.timing.droppedMs).toBe(0);
        expect(result.checkpoints).toHaveLength(125);
        positions.push(s.vehicle!.frames.current!.position);
        expect(s.vehicle!.state.recoveries).toBe(0);
      } finally { s.dispose(); }
    }
    expect(positions[1]).toEqual(positions[0]); expect(positions[2]).toEqual(positions[0]);
  }, 30000);
  it('records stalled wall time without skipping commands and rejects interruption permanently', async () => {
    const { s, replay, tick } = await session();
    try {
      s.resume(); replay.start(); tick(0); tick(1000);
      expect(s.timing.steps).toBe(5); expect(replay.snapshot().step).toBe(5);
      expect(s.timing.droppedMs).toBeGreaterThan(900);
      replay.invalidate('Focus lost'); s.pause(); s.resume(); tick(2000); tick(2100);
      expect(replay.snapshot().accepted).toBe(false); expect(s.timing.steps).toBe(5);
      expect(() => replay.start()).toThrow(/one-shot/);
    } finally { s.dispose(); }
  });
  it('leaves final presentation and completion marking ahead of pause even with spare catch-up steps', async () => {
    const { s, replay } = await session();
    try {
      s.resume(); replay.start(); s.advance(0);
      for (let step = 1; step < 7500; step++) s.advance(step * 1000 / 60);
      s.advance(125050);
      expect(s.timing.steps).toBe(7500); expect(s.state.status).toBe('running');
      expect(replay.pendingComplete).toBe(true); expect(replay.snapshot().phase).toBe('measuring');
      replay.afterFrame();
      expect(replay.snapshot().phase).toBe('complete');
      s.pause(); expect(replay.snapshot().accepted).toBe(true);
    } finally { s.dispose(); }
  });
  it('rejects a changed trajectory instead of treating completion as a performance pass', async () => {
    const changed = structuredClone(fixture); changed.checkpoints[0].position.x += 2;
    const { s, replay, tick } = await session(changed);
    try {
      s.resume(); replay.start(); tick(0);
      for (let i = 1; i <= 61; i++) tick(i * 1000 / 60);
      expect(replay.snapshot().failure).toMatch(/Trajectory diverged at step 60/);
      expect(replay.snapshot().accepted).toBe(false); expect(s.timing.steps).toBe(60);
    } finally { s.dispose(); }
  });
  it('refuses incompatible tapes, settings and unsafe fixture starts', async () => {
    const bad = structuredClone(fixture); bad.commands[0][0] = NaN;
    expect(() => validateFixture(bad)).toThrow(/command/);
    const settings = structuredClone(fixture); Reflect.set(settings.vehicle, 'mass', 1101);
    expect(() => validateFixture(settings)).toThrow(/configuration/);
    const unsafe = structuredClone(fixture); unsafe.startPose.position.x = 10000;
    const { s } = await session(unsafe);
    expect(s.state.status).toBe('error'); expect(s.vehicle).toBeUndefined(); s.dispose();
  });
});
