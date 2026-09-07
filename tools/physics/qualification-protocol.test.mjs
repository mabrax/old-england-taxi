import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { installQualificationProtocol } from './qualification-protocol.mjs';

// A deterministic DOM/event adapter tests the exact self-contained function
// Puppeteer injects, including queued MutationRecords at phase boundaries.
function fixture() {
  let time = 0, watchdog, observer, pending = [];
  const surface = () => {
    const handlers = new Map();
    return {
      addEventListener(name, callback) { handlers.set(name, callback); },
      removeEventListener(name) { handlers.delete(name); },
      emit(name) { handlers.get(name)?.({ type: name, target: this }); }
    };
  };
  const attributes = { mode: ['drivingMode', 'data-driving-mode'], physics: ['physicsStatus', 'data-physics-status'], vehicle: ['vehicleStatus', 'data-vehicle-status'] };
  const canvas = {
    dataset: { drivingMode: 'driving', physicsStatus: 'running', vehicleStatus: 'ready', physicsSteps: '120' },
    getAttribute(name) { return this.dataset[Object.values(attributes).find(value => value[1] === name)[0]]; }
  };
  const window = surface(), document = Object.assign(surface(), {
    hidden: false, focused: true, hasFocus() { return this.focused; }, querySelector() { return canvas; }
  });
  const environment = {
    window, document, performance: { now: () => time },
    setInterval: callback => { watchdog = callback; return 1; }, clearInterval: () => { watchdog = undefined; },
    MutationObserver: class {
      constructor(callback) { observer = callback; }
      observe() {}
      takeRecords() { const result = pending; pending = []; return result; }
      disconnect() {}
    }
  };
  runInNewContext(`(${installQualificationProtocol.toString()})()`, environment);
  return {
    api: window.__qualificationProtocol, document, window,
    advance(ms) { time += ms; watchdog?.(); },
    mutate(values) {
      for (const [key, value] of Object.entries(values)) {
        const [property, attributeName] = attributes[key];
        pending.push({ target: canvas, attributeName, oldValue: canvas.dataset[property] });
        canvas.dataset[property] = value;
      }
    },
    flush() { const records = pending; pending = []; observer(records); }
  };
}

test('separates deliberate reset time from valid driving intervals', () => {
  const f = fixture(); f.api.start(); f.advance(100);
  assert.equal(f.api.phase, 'drive');
  f.api.beginReset(1); assert.equal(f.api.phase, 'reset');
  f.mutate({ mode: 'paused', physics: 'paused' }); f.flush(); f.advance(40);
  f.mutate({ mode: 'driving', physics: 'running' }); f.api.endReset(1); f.advance(150);
  assert.equal(f.api.phase, 'drive');
  const result = f.api.finish(true);
  assert.equal(f.api.phase, 'finished');
  assert.equal(result.accepted, true);
  assert.equal(result.totals.driveMs, 250); assert.equal(result.totals.resetMs, 40);
  assert.equal(result.violations.length, 0);
});

test('a paused maneuver endpoint cannot be excused by the next scripted reset', () => {
  const f = fixture(); f.api.start(); f.advance(100);
  f.mutate({ mode: 'paused', physics: 'paused' }); f.flush(); f.advance(25);
  assert.throws(() => f.api.beginReset(28), /protocol invalid/);
  const result = f.api.finish(true);
  assert.equal(result.accepted, false); assert.equal(result.totals.unexpectedMs, 25);
  assert.equal(result.intervals.at(-1).phase, 'drive');
});

test('retains a transient pause/resume in a pending mutation batch before reset', () => {
  const f = fixture(); f.api.start(); f.advance(100);
  f.mutate({ mode: 'paused' }); f.mutate({ mode: 'driving' });
  assert.throws(() => f.api.beginReset(2), /protocol invalid/);
  const result = f.api.finish(true);
  assert.equal(result.accepted, false);
  assert.ok(result.violations.some(v => v.state.mode === 'paused'));
});

test('hidden or blurred intervals stay rejected after focus and visibility return', () => {
  for (const kind of ['hidden', 'blur']) {
    const f = fixture(); f.api.start(); f.advance(100);
    if (kind === 'hidden') { f.document.hidden = true; f.document.emit('visibilitychange'); f.document.hidden = false; f.document.emit('visibilitychange'); }
    else { f.window.emit('blur'); f.window.emit('focus'); }
    assert.throws(() => f.api.checkpoint('returned'), /protocol invalid/);
    assert.equal(f.api.finish(true).accepted, false);
  }
});

test('watchdog observes invalid state even when no animation frame or mutation callback arrives', () => {
  const f = fixture(); f.api.start(); f.advance(100);
  f.mutate({ physics: 'paused' }); f.document.hidden = true; f.advance(100);
  assert.throws(() => f.api.checkpoint('command after'), /protocol invalid/);
  assert.equal(f.api.finish(true).accepted, false);
});

test('reset markers do not excuse hidden state, a still-paused resume, or unfinished transitions', () => {
  const hidden = fixture(); hidden.api.start(); hidden.advance(100); hidden.api.beginReset(1);
  hidden.document.hidden = true; hidden.document.emit('visibilitychange'); hidden.document.hidden = false;
  assert.throws(() => hidden.api.endReset(1), /protocol invalid/);
  const paused = fixture(); paused.api.start(); paused.advance(100); paused.api.beginReset(1);
  paused.mutate({ mode: 'paused', physics: 'paused' });
  assert.throws(() => paused.api.endReset(1), /protocol invalid/);
  const unfinished = fixture(); unfinished.api.start(); unfinished.advance(100); unfinished.api.beginReset(1);
  assert.equal(unfinished.api.finish(true).accepted, false);
});

test('lack of physics progress and incomplete runs cannot pass on state alone', () => {
  const f = fixture(); f.api.start(); f.advance(100);
  assert.throws(() => f.api.noProgress('command'), /protocol invalid/);
  assert.equal(f.api.finish(true).accepted, false);
  const incomplete = fixture(); incomplete.api.start(); incomplete.advance(100);
  assert.equal(incomplete.api.finish(false).accepted, false);
});

test('bounded evidence overflow rejects acceptance instead of silently discarding evidence', () => {
  const f = fixture(); f.api.start(); f.advance(100);
  assert.throws(() => { for (let i = 0; i < 10001; i++) f.api.checkpoint(String(i)); }, /protocol invalid/);
  const result = f.api.finish(true);
  assert.equal(result.accepted, false); assert.ok(result.droppedRecords > 0);
});
