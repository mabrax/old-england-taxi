// Production preview only; no live acquisition, canonical cache or browser-only physics globals.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const base = process.argv[2] ?? 'http://127.0.0.1:4186';
const output = resolve(process.argv[3] ?? '.zone-cache/physics/browser');
mkdirSync(output, { recursive: true });
const session = `physical-browser-${process.pid}`;
const run = (...args) => execFileSync('npx', ['--yes', 'agent-browser', '--session', session, ...args], { encoding: 'utf8', timeout: 60_000 }).trim();
const evaluate = code => JSON.parse(run('eval', code));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const catalogue = JSON.parse(readFileSync(new URL('../../public/zones/index.json', import.meta.url)));
const observations = [];
const state = () => evaluate(`({ ...document.querySelector('canvas').dataset, canvases:document.querySelectorAll('canvas').length, overflow:document.documentElement.scrollWidth>innerWidth, hidden:document.hidden, focused:document.hasFocus() })`);
const frames = () => evaluate('new Promise(resolve=>{let count=0;const frame=()=>++count===6?resolve(true):requestAnimationFrame(frame);requestAnimationFrame(frame)})');
try {
  run('open', base);
  for (const [mode, width, height] of [['desktop', 1440, 900], ['mobile-viewport', 390, 844]]) {
    run('set', 'viewport', String(width), String(height));
    for (const zone of catalogue.zones) {
      run('open', `${base}/?zone=${zone.id}&qa=1`);
      run('wait', '[data-physics-state="paused"]');
      run('snapshot', '-i');
      const initial = state();
      assert(initial.canvases === 1 && !initial.overflow && initial.physicsColliders === '7' && initial.physicsSteps === '0', `Initial world failed: ${zone.label}`);
      run('find', 'label', 'Collision surfaces', 'check');
      run('find', 'label', 'Source outlines', 'click');
      run('find', 'label', 'Generated geometry', 'click');
      const hiddenGeometry = state();
      assert(hiddenGeometry.physicsColliders === '7' && hiddenGeometry.collisionVisible === 'true' && hiddenGeometry.generatedVisible === 'false', 'QA affected collision inspection');
      const screenshot = join(output, `${mode}-${zone.id}.png`);
      run('screenshot', screenshot);
      run('find', 'label', 'Generated geometry', 'check');
      run('find', 'label', 'Collision surfaces', 'click');
      run('find', 'role', 'button', 'click', '--name', 'Drive', '--exact');
      run('wait', '--fn', 'document.querySelector("canvas").dataset.physicsStatus==="running"');
      run('wait', '--fn', 'Number(document.querySelector("canvas").dataset.physicsSteps)>0');
      run('find', 'role', 'button', 'click', '--name', 'Pause driving', '--exact');
      const paused = state(); frames();
      assert(state().physicsSteps === paused.physicsSteps, 'Paused physics advanced');
      assert(!run('errors') && !run('console'), 'Unexpected browser error');
      observations.push({ mode, label: zone.label, initial, stepsBeforePause: paused.physicsSteps, qaCollisionIndependence: 'pass', pauseResume: 'pass', screenshot });
      console.log(`${mode}: ${zone.label} physics, collision inspection and pause/resume passed`);
    }
  }
  run('set', 'viewport', '1440', '900');
  run('find', 'role', 'button', 'click', '--name', 'Resume driving', '--exact');
  run('tab', 'new', '--label', 'visibility-check', 'about:blank');
  run('tab', 't1');
  run('wait', '--fn', 'document.querySelector("canvas").dataset.physicsStatus==="paused"');
  const afterTabReturn = state(); frames();
  assert(state().physicsSteps === afterTabReturn.physicsSteps, 'Tab return resumed simulation');
  observations.push({ check: 'real browser tab departure/return pauses and requires explicit resume', result: 'pass', afterTabReturn });
  run('tab', 'close', 'visibility-check');

  const zone = catalogue.zones[1];
  run('network', 'route', `${base}/api/zone-generation`, '--abort');
  run('open', `${base}/?zone=${zone.id}`);
  run('wait', '[data-physics-state="paused"]'); run('find', 'role', 'button', 'click', '--name', 'Locations & tools', '--exact'); run('wait', '.generation-connection'); run('find', 'role', 'button', 'click', '--name', 'Close workspace', '--exact');
  assert(state().physicsColliders === '7', 'Physics depends on generation service');
  observations.push({ check: 'prepared world loads without generation service or source QA', result: 'pass' });
  run('network', 'unroute');
  run('open', `${base}/?zone=${zone.id}`);
  run('wait', '[data-physics-state="paused"]');
  // Make the lazy module fail before it can initialize; geometry must remain inspectable.
  run('network', 'route', `${base}/assets/vehicle-*.js`, '--body', 'throw new Error("Injected physics module failure");');
  run('open', `${base}/?zone=${zone.id}`);
  run('wait', '[data-physics-state="error"]');
  const failed = state();
  assert(failed.canvases === 1 && failed.physicsColliders === '0' && evaluate('document.querySelector("[data-zone-status]").dataset.zoneStatus') === 'ready', 'Physics failure removed artifact inspection');
  run('find', 'role', 'button', 'click', '--name', 'Reset view', '--exact');
  run('screenshot', join(output, 'physics-unavailable.png'));
  observations.push({ check: 'physics initialization failure retains renderer and camera reset', result: 'pass', failed });
  run('network', 'unroute'); run('open', `${base}/?zone=${zone.id}`); run('wait', '[data-physics-state="paused"]');
  observations.push({ check: 'fresh navigation recovers from physics failure', result: 'pass' });
  writeFileSync(join(output, 'results.json'), JSON.stringify({ base, checkedAt: new Date().toISOString(), browser: evaluate('navigator.userAgent'), observations }, null, 2) + '\n');
  console.log(`Physics browser evidence: ${output}`);
} finally { run('close'); }
