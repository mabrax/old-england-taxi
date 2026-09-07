// Capture real mouse-driven orbit/zoom/pan frames for visual depth inspection.
// Usage: node tools/zone-server/verify-rendering.mjs <zone-url> <output-directory>
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const url = process.argv[2];
if (!url) throw new Error('Pass the local preview zone URL and an output directory.');
const output = resolve(process.argv[3] ?? '.zone-cache/rendering-qa');
mkdirSync(output, { recursive: true });
const session = `street-frames-${process.pid}`;
const run = (...args) => execFileSync('npx', ['--yes', 'agent-browser', '--session', session, ...args], { encoding: 'utf8', timeout: 60_000 }).trim();
const evaluate = code => JSON.parse(run('eval', code));
const settle = () => evaluate('new Promise(resolve => { let frames=0; const tick=()=>++frames===120?resolve(true):requestAnimationFrame(tick); requestAnimationFrame(tick); })');
const frames = [];
let recording = false;
try {
  run('open', url);
  run('set', 'viewport', '1280', '800');
  run('record', 'start', join(output, 'camera-motion.webm'));
  recording = true;
  run('wait', '[data-zone-status="ready"]');
  const bounds = evaluate('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()');
  const startX = Math.round(bounds.x + bounds.width * 0.5);
  const startY = Math.round(bounds.y + bounds.height * 0.65);
  function drag(dx, dy, button = 'left') {
    run('mouse', 'move', String(startX), String(startY));
    run('mouse', 'down', button);
    for (let step = 1; step <= 4; step++) run('mouse', 'move', String(Math.round(startX + dx * step / 4)), String(Math.round(startY + dy * step / 4)));
    run('mouse', 'up', button);
  }
  function wheel(deltaY) {
    // The CLI's mouse wheel currently targets (0, 0), regardless of the last move.
    // Dispatch to the canvas so OrbitControls receives the actual wheel input.
    evaluate(`document.querySelector('canvas').dispatchEvent(new WheelEvent('wheel', {deltaY:${deltaY},clientX:${startX},clientY:${startY},bubbles:true,cancelable:true}))`);
  }
  function capture(name) {
    settle();
    const state = evaluate('({status:document.querySelector("[data-zone-status]").dataset.zoneStatus,zone:document.querySelector("canvas").dataset.zoneSlug,canvases:document.querySelectorAll("canvas").length})');
    if (state.status !== 'ready' || state.canvases !== 1) throw new Error(`Renderer failed at ${name}`);
    const file = `${String(frames.length).padStart(2, '0')}-${name}.png`;
    run('screenshot', join(output, file));
    const sha256 = createHash('sha256').update(readFileSync(join(output, file))).digest('hex');
    if (frames.at(-1)?.sha256 === sha256) throw new Error(`Camera input did not change the frame at ${name}`);
    frames.push({ name, file, sha256, ...state });
    console.log(`Captured ${name}`);
  }
  capture('overview');
  drag(140, 0); capture('orbit');
  drag(40, -65); capture('low-angle');
  wheel(-1600); capture('close');
  drag(100, 30, 'right'); capture('pan');
  drag(0, 170); capture('overhead');
  wheel(5000); capture('far');
  run('find', 'role', 'button', 'click', '--name', 'Reset view', '--exact');
  capture('reset');
  const errors = run('errors');
  if (errors) throw new Error(errors);
  run('record', 'stop'); recording = false;
  writeFileSync(join(output, 'frames.json'), JSON.stringify({ url, checkedAt: new Date().toISOString(), viewport: { width: 1280, height: 800 }, frames, browserErrors: [] }, null, 2) + '\n');
  console.log(`Rendering evidence: ${output}`);
} finally {
  if (recording) run('record', 'stop');
  run('close');
}
