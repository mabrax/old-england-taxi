import { NEUTRAL, type VehicleCommand } from '../physics/vehicle-config';

export type DrivingAction = 'forward' | 'reverse' | 'left' | 'right' | 'brake';
const bindings: Record<string, DrivingAction> = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'reverse', ArrowDown: 'reverse',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'brake'
};

/** Source IDs keep multiple fingers and keyboard aliases independent. Clear requires fresh presses. */
export function createInputState() {
  const held = new Map<string, DrivingAction>();
  return {
    press(id: string, action: DrivingAction) { held.set(id, action); },
    release(id: string) { held.delete(id); },
    clear() { held.clear(); },
    command(): VehicleCommand {
      const active = new Set(held.values());
      const forward = active.has('forward'), reverse = active.has('reverse');
      return { throttle: Number(forward) - Number(reverse), steering: Number(active.has('left')) - Number(active.has('right')),
        brake: Number(active.has('brake') || forward && reverse) };
    }
  };
}

/** Scene lifetime owns all listeners and captures. No timers, RAF or global keyboard shortcuts. */
export function createDrivingInput(canvas: HTMLElement, options: {
  active: () => boolean;
  pause: (reason: string) => void;
  reset: () => void;
}) {
  const state = createInputState();
  const pointers = new Map<number, HTMLElement>();
  const clear = () => {
    state.clear();
    const previous = [...pointers]; pointers.clear();
    for (const [id, element] of previous) {
      element.removeAttribute('data-held');
      if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
    }
  };
  const keyboard = (event: KeyboardEvent) => {
    if (!options.active() || event.target !== canvas) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) {
      options.pause('Keyboard focus changed. Release controls, then Resume driving.'); return;
    }
    if (event.code === 'Escape') { event.preventDefault(); options.pause('Paused. Release controls, then Resume driving.'); return; }
    if (event.code === 'KeyR' && !event.repeat) { event.preventDefault(); options.reset(); return; }
    const action = bindings[event.code];
    if (!action) return;
    event.preventDefault();
    // Repeated keydowns never recreate cleared state after blur, pause or reset.
    if (!event.repeat) state.press(`key:${event.code}`, action);
  };
  const keyup = (event: KeyboardEvent) => state.release(`key:${event.code}`);
  const focus = (event: FocusEvent) => {
    if (options.active() && event.target !== canvas) options.pause('Paused for workspace controls. Resume driving when ready.');
  };
  const up = (event: PointerEvent) => {
    const element = pointers.get(event.pointerId);
    if (!element) return;
    pointers.delete(event.pointerId); state.release(`pointer:${event.pointerId}`);
    if (![...pointers.values()].includes(element)) element.removeAttribute('data-held');
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
  };
  const cancelled = (event: PointerEvent) => {
    if (pointers.has(event.pointerId)) options.pause('Touch interrupted. Release controls, then Resume driving.');
  };
  document.addEventListener('keydown', keyboard);
  document.addEventListener('keyup', keyup);
  document.addEventListener('focusin', focus);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', cancelled);
  document.addEventListener('lostpointercapture', cancelled);
  return {
    clear,
    command: () => options.active() ? state.command() : { ...NEUTRAL },
    pointerDown(event: PointerEvent, action: DrivingAction) {
      if (!options.active() || event.button !== 0) return;
      event.preventDefault();
      const element = event.currentTarget as HTMLElement;
      try { element.setPointerCapture(event.pointerId); }
      catch { options.pause('Touch capture unavailable. Resume to try again.'); return; }
      pointers.set(event.pointerId, element); state.press(`pointer:${event.pointerId}`, action);
      element.setAttribute('data-held', 'true');
      canvas.focus({ preventScroll: true });
    },
    dispose() {
      clear();
      document.removeEventListener('keydown', keyboard);
      document.removeEventListener('keyup', keyup);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancelled);
      document.removeEventListener('lostpointercapture', cancelled);
    }
  };
}
