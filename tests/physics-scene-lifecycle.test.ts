import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { physicalFixture } from './helpers/physical-fixture';

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(async () => {}), create: vi.fn(), vehicle: vi.fn(), renderers: [] as any[], observers: [] as any[], controls: [] as any[]
}));
vi.mock('../src/lib/physics/vehicle', () => ({
  initializeRapier: mocks.initialize, createPhysicalWorld: mocks.create, createVehicle: mocks.vehicle
}));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    domElement = { dataset: {}, setAttribute: vi.fn(), remove: vi.fn(), className: '' };
    setPixelRatio = vi.fn(); setSize = vi.fn(); render = vi.fn(); dispose = vi.fn();
    constructor() { mocks.renderers.push(this); }
  } };
});
vi.mock('three/examples/jsm/controls/OrbitControls.js', async () => {
  const { Vector3 } = await import('three');
  return { OrbitControls: class {
    target = new Vector3(); update = vi.fn(); dispose = vi.fn();
    constructor() { mocks.controls.push(this); }
  } };
});
import { createValidationScene } from '../src/lib/scene/validation-scene';

class TrackedEvents extends EventTarget {
  listeners = new Set<EventListenerOrEventListenerObject>();
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    if (callback) this.listeners.add(callback); super.addEventListener(type, callback, options);
  }
  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    if (callback) this.listeners.delete(callback); super.removeEventListener(type, callback, options);
  }
}
let doc: TrackedEvents & { hidden: boolean; hasFocus: () => boolean };
let win: TrackedEvents;
let frames: Map<number, FrameRequestCallback>;
const controllers: ReturnType<typeof createValidationScene>[] = [];
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const create = () => {
  const callback = vi.fn();
  const controller = createValidationScene({ getBoundingClientRect: () => ({ width: 800, height: 600 }), appendChild: vi.fn() } as unknown as HTMLElement, physicalFixture(), undefined, callback);
  controllers.push(controller); return { controller, callback };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.renderers.length = mocks.observers.length = mocks.controls.length = 0;
  mocks.initialize.mockImplementation(async () => {});
  mocks.vehicle.mockReturnValue(undefined);
  mocks.create.mockImplementation(() => ({
    metrics: { colliders: 6 }, envelope: { minimumX: -29, maximumX: 29, minimumZ: -29, maximumZ: 29 },
    dispose: vi.fn(), step: vi.fn(), debugRender: () => ({ vertices: new Float32Array() })
  }));
  doc = Object.assign(new TrackedEvents(), { hidden: false, hasFocus: () => true });
  win = new TrackedEvents(); frames = new Map(); let id = 0;
  Object.assign(win, {
    devicePixelRatio: 1,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (handle: number) => frames.delete(handle)
  });
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn(); disconnect = vi.fn();
    constructor() { mocks.observers.push(this); }
  });
});
afterEach(() => { controllers.splice(0).forEach(controller => controller.dispose()); vi.unstubAllGlobals(); });

describe('scene and simulation share one lifetime', () => {
  it('repeated mount/dispose leaves no frame, listener, observer, control or world active', async () => {
    for (let i = 0; i < 8; i++) {
      const { controller } = create(); await settle();
      expect(frames.size).toBe(1); expect(doc.listeners.size).toBe(1); expect(win.listeners.size).toBe(2);
      const world = mocks.create.mock.results.at(-1)!.value;
      controller.dispose(); controller.dispose();
      expect(world.dispose).toHaveBeenCalledTimes(1);
      expect(frames.size).toBe(0); expect(doc.listeners.size).toBe(0); expect(win.listeners.size).toBe(0);
      expect(mocks.renderers.at(-1).dispose).toHaveBeenCalledTimes(1);
      expect(mocks.renderers.at(-1).domElement.remove).toHaveBeenCalledTimes(1);
      expect(mocks.observers.at(-1).disconnect).toHaveBeenCalledTimes(1);
      expect(mocks.controls.at(-1).dispose).toHaveBeenCalledTimes(1);
    }
  });

  it('pauses on blur/hidden, stops hidden rendering, and keeps QA independent of colliders', async () => {
    const { controller, callback } = create(); await settle();
    const world = mocks.create.mock.results[0].value;
    controller.setPhysicsPaused(false);
    expect(callback.mock.lastCall?.[0].status).toBe('running');
    controller.setQaVisibility(true, false); controller.setCollisionVisibility(true);
    expect(world.dispose).not.toHaveBeenCalled(); expect(mocks.create).toHaveBeenCalledTimes(1);
    win.dispatchEvent(new Event('blur'));
    expect(callback.mock.lastCall?.[0].status).toBe('paused');
    controller.setPhysicsPaused(false);
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(0); expect(callback.mock.lastCall?.[0].status).toBe('paused');
    controller.setPhysicsPaused(false); expect(callback.mock.lastCall?.[0].status).toBe('paused');
    doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(1); expect(callback.mock.lastCall?.[0].status).toBe('paused');
    win.dispatchEvent(new Event('pagehide'));
    expect(world.dispose).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
  });

  it('blur and visibility clear vehicle input through the existing session, and disposal releases it', async () => {
    const vehicle = { clearInput: vi.fn(), dispose: vi.fn(), state: { status: 'ready', recoveries: 0 }, frames: {} };
    mocks.vehicle.mockReturnValue(vehicle);
    const original = mocks.create.getMockImplementation()!;
    mocks.create.mockImplementation(() => ({ ...original(), world: { colliders: { len: () => 7 }, bodies: { len: () => 1 } } }));
    const { controller } = create(); await settle();
    controller.setPhysicsPaused(false); win.dispatchEvent(new Event('blur'));
    expect(vehicle.clearInput).toHaveBeenCalledTimes(1);
    controller.setPhysicsPaused(false); doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
    expect(vehicle.clearInput).toHaveBeenCalledTimes(2);
    controller.dispose(); controller.dispose(); expect(vehicle.dispose).toHaveBeenCalledTimes(1);
  });

  it('suppresses late initialization after unmount and reports failure while retaining rendering', async () => {
    let resolve!: () => void;
    mocks.initialize.mockImplementation(() => new Promise<void>(yes => { resolve = yes; }));
    const { controller, callback } = create(); await settle(); controller.dispose(); resolve(); await settle();
    expect(mocks.create).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled(); expect(frames.size).toBe(0);
    mocks.initialize.mockRejectedValueOnce(new Error('WASM blocked'));
    const failing = create(); await settle();
    expect(failing.callback.mock.lastCall?.[0]).toEqual({ status: 'error', message: 'WASM blocked' });
    expect(frames.size).toBe(1); expect(mocks.renderers.at(-1).dispose).not.toHaveBeenCalled();
  });
});
