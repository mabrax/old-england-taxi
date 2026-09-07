import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDrivingInput, createInputState } from '../src/lib/scene/driving-input';

class Surface extends EventTarget {
  captured = new Set<number>(); attrs = new Map<string, string>();
  focus = vi.fn();
  setPointerCapture(id: number) { this.captured.add(id); }
  hasPointerCapture(id: number) { return this.captured.has(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); }
  setAttribute(key: string, value: string) { this.attrs.set(key, value); }
  removeAttribute(key: string) { this.attrs.delete(key); }
}
let doc: Surface, canvas: Surface, button: Surface, active: boolean;
let input: ReturnType<typeof createDrivingInput>;
let pause: ReturnType<typeof vi.fn>, reset: ReturnType<typeof vi.fn>;
const event = (type: string, properties: Record<string, unknown>) => {
  const e = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(properties)) Object.defineProperty(e, key, { value });
  return e;
};
const key = (code: string, type = 'keydown', properties = {}) => doc.dispatchEvent(event(type, { code, target: canvas, repeat: false, ...properties }));
const down = (id: number, action: 'forward' | 'left' | 'reverse', element = button) => input.pointerDown(event('pointerdown', { pointerId: id, button: 0, currentTarget: element }) as PointerEvent, action);
beforeEach(() => {
  doc = new Surface(); canvas = new Surface(); button = new Surface(); active = true;
  vi.stubGlobal('document', doc);
  pause = vi.fn(() => { active = false; input.clear(); }); reset = vi.fn(() => { active = false; input.clear(); });
  input = createDrivingInput(canvas as unknown as HTMLElement, { active: () => active, pause, reset });
});
afterEach(() => { input.dispose(); vi.unstubAllGlobals(); });

describe('production driving input', () => {
  it('combines steering and pedals, brakes conflicting pedals and cancels conflicting steering', () => {
    const state = createInputState();
    state.press('1', 'forward'); state.press('2', 'left');
    expect(state.command()).toEqual({ throttle: 1, steering: 1, brake: 0 });
    state.press('3', 'reverse'); state.press('4', 'right');
    expect(state.command()).toEqual({ throttle: 0, steering: 0, brake: 1 });
  });
  it('keeps keyboard aliases independent until both are released', () => {
    key('KeyW'); key('ArrowUp'); key('KeyA'); key('KeyW', 'keyup');
    expect(input.command()).toEqual({ throttle: 1, steering: 1, brake: 0 });
    key('ArrowUp', 'keyup'); expect(input.command().throttle).toBe(0);
  });
  it('requires a fresh press after reset/pause even while the OS repeats a held throttle', () => {
    key('KeyW'); key('KeyR'); expect(reset).toHaveBeenCalledOnce();
    active = true; key('KeyW', 'keydown', { repeat: true });
    expect(input.command().throttle).toBe(0);
    key('KeyW', 'keyup'); key('KeyW'); expect(input.command().throttle).toBe(1);
    key('Escape'); active = true; key('KeyW', 'keydown', { repeat: true }); expect(input.command().throttle).toBe(0);
  });
  it('UI fields, selectors, buttons, contenteditable and IME never produce driving commands', () => {
    for (const target of ['input', 'select', 'button', 'contenteditable'].map(() => new Surface())) key('KeyW', 'keydown', { target });
    key('KeyW', 'keydown', { isComposing: true });
    expect(input.command().throttle).toBe(0);
    pause.mockClear(); active = true;
    key('KeyW'); doc.dispatchEvent(event('focusin', { target: button }));
    expect(pause).toHaveBeenCalledOnce(); expect(input.command().throttle).toBe(0);
  });
  it('two captured touches combine, and releasing one outside its button preserves the other', () => {
    const steering = new Surface(); down(1, 'forward'); down(2, 'left', steering);
    expect(input.command()).toEqual({ throttle: 1, steering: 1, brake: 0 });
    doc.dispatchEvent(event('pointerup', { pointerId: 1 }));
    expect(input.command()).toEqual({ throttle: 0, steering: 1, brake: 0 });
    expect(button.captured.size).toBe(0); expect(steering.captured.size).toBe(1);
    doc.dispatchEvent(event('lostpointercapture', { pointerId: 1 })); expect(pause).not.toHaveBeenCalled();
  });
  it.each(['pointercancel', 'lostpointercapture'])('%s clears all captures and pauses without stale pedals', type => {
    down(1, 'forward'); down(2, 'left'); doc.dispatchEvent(event(type, { pointerId: 1 }));
    expect(pause).toHaveBeenCalledOnce(); expect(button.captured.size).toBe(0);
    active = true; expect(input.command()).toEqual({ throttle: 0, steering: 0, brake: 0 });
  });
  it('capture failure pauses and never applies input', () => {
    vi.spyOn(button, 'setPointerCapture').mockImplementation(() => { throw new Error('No pointer'); });
    down(1, 'forward'); expect(pause).toHaveBeenCalledOnce(); expect(input.command().throttle).toBe(0);
  });
  it('dispose releases captures and removes keyboard/focus handlers', () => {
    down(1, 'forward'); input.dispose(); key('KeyW');
    doc.dispatchEvent(event('focusin', { target: button }));
    expect(button.captured.size).toBe(0); expect(input.command().throttle).toBe(0); expect(pause).not.toHaveBeenCalled();
  });
});
