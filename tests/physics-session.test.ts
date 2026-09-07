import { describe, expect, it, vi } from 'vitest';
import type { PhysicalWorld } from '../src/lib/physics/physical-world';
import { createPhysicsSession, MAX_CATCH_UP_STEPS, PHYSICS_INIT_TIMEOUT_MS, STEP_MS } from '../src/lib/physics/physics-session';
import { physicalFixture } from './helpers/physical-fixture';

const deferred = () => {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function setup(initializeRapier = async () => {}) {
  const physical = { step: vi.fn(), dispose: vi.fn(), metrics: {} } as unknown as PhysicalWorld;
  const module = { initializeRapier, createPhysicalWorld: vi.fn(() => physical) };
  const state = vi.fn();
  const session = createPhysicsSession(physicalFixture(), state, async () => module);
  return { session, physical, module, state };
}

describe('asynchronous simulation ownership and fixed stepping', () => {
  it('starts paused; resumes with an empty clock and drops excessive catch-up', async () => {
    const { session, physical } = setup(); await session.ready;
    expect(session.state.status).toBe('paused');
    session.advance(10000); expect(physical.step).not.toHaveBeenCalled();
    session.resume(); session.advance(10000); session.advance(10000 + STEP_MS);
    expect(physical.step).toHaveBeenCalledTimes(1);
    session.advance(20000);
    expect(physical.step).toHaveBeenCalledTimes(1 + MAX_CATCH_UP_STEPS);
    expect(session.timing.droppedMs).toBeGreaterThan(9800);
    session.pause(); session.advance(1e6); session.resume(); session.advance(1e6);
    expect(physical.step).toHaveBeenCalledTimes(6);
    session.advance(1e6 + STEP_MS); expect(physical.step).toHaveBeenCalledTimes(7);
    session.dispose(); session.dispose(); session.resume(); session.advance(2e6);
    expect(physical.dispose).toHaveBeenCalledTimes(1);
    expect(session.physical).toBeUndefined();
  });

  it.each([30, 60, 120, 144])('advances exactly 120 steps over two seconds at %i render Hz', async hz => {
    const { session } = setup(); await session.ready; session.resume();
    for (let i = 0; i <= hz * 2; i++) session.advance(i * 1000 / hz);
    expect(session.timing.steps).toBe(120); session.dispose();
  });

  it('does not construct a world after disposal during WASM initialization', async () => {
    const gate = deferred(); const { session, module, state } = setup(() => gate.promise);
    await Promise.resolve(); await Promise.resolve();
    session.dispose(); gate.resolve(); await session.ready;
    expect(module.createPhysicalWorld).not.toHaveBeenCalled(); expect(state).not.toHaveBeenCalled();
    expect(session.state.status).toBe('disposed');
  });

  it('does not initialize WASM after disposal during module loading', async () => {
    const gate = deferred(); const initializeRapier = vi.fn(async () => {});
    const createPhysicalWorld = vi.fn();
    const session = createPhysicsSession(physicalFixture(), vi.fn(), async () => {
      await gate.promise; return { initializeRapier, createPhysicalWorld };
    });
    session.dispose(); gate.resolve(); await session.ready;
    expect(initializeRapier).not.toHaveBeenCalled(); expect(createPhysicalWorld).not.toHaveBeenCalled();
  });

  it('reports init failure separately, suppresses late failure after disposal, and permits a fresh session', async () => {
    const failing = setup(async () => { throw new Error('WASM failed'); }); await failing.session.ready;
    expect(failing.session.state).toEqual({ status: 'error', message: 'WASM failed' });
    expect(failing.module.createPhysicalWorld).not.toHaveBeenCalled();
    const gate = deferred(); const late = setup(() => gate.promise);
    late.session.dispose(); gate.reject(new Error('late failure'));
    // Avoid an unrelated unhandled rejection when disposal prevents initialization from starting.
    void gate.promise.catch(() => {}); await late.session.ready;
    expect(late.state).not.toHaveBeenCalled();
    const fresh = setup(); await fresh.session.ready;
    expect(fresh.session.state.status).toBe('paused'); fresh.session.dispose();
  });

  it('frees a world on stepping failure and ignores later frames', async () => {
    const { session, physical } = setup(); await session.ready;
    vi.mocked(physical.step).mockImplementation(() => { throw new Error('step failed'); });
    session.resume(); session.advance(0); session.advance(100);
    expect(session.state.status).toBe('error');
    expect(physical.dispose).toHaveBeenCalledTimes(1);
    session.advance(1000); session.dispose(); expect(physical.dispose).toHaveBeenCalledTimes(1);
  });

  it('bounds stalled initialization and prevents completion after the deadline from reviving it', async () => {
    vi.useFakeTimers();
    try {
      const gate = deferred(); const { session, module } = setup(() => gate.promise);
      await vi.advanceTimersByTimeAsync(PHYSICS_INIT_TIMEOUT_MS);
      await session.ready;
      expect(session.state.status).toBe('error');
      gate.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(module.createPhysicalWorld).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      session.dispose();
    } finally { vi.useRealTimers(); }
  });

  it('turns browser module-download failures into actionable feedback without an internal asset URL', async () => {
    const session = createPhysicsSession(physicalFixture(), vi.fn(), async () => {
      throw new TypeError('Failed to fetch dynamically imported module: http://localhost/assets/physical-world-hash.js');
    });
    await session.ready;
    expect(session.state).toEqual({ status: 'error', message: 'The physics engine could not be loaded. Reload to retry.' });
    session.dispose();
  });
});
