// Offline browser failure/reconnection/navigation regressions with explicit stub API responses.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
const base = process.argv[2] ?? 'http://127.0.0.1:4188';
const output = resolve(process.argv[3] ?? '.zone-cache/phase-03/generation-browser'); mkdirSync(output, { recursive: true });
const session = `driving-generation-${process.pid}`;
const run = (...args) => execFileSync('npx', ['--yes', 'agent-browser', '--session', session, ...args], { encoding: 'utf8', timeout: 60000 }).trim();
const evaluate = code => JSON.parse(run('eval', code));
const click = name => run('find', 'role', 'button', 'click', '--name', name, '--exact');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const zones = JSON.parse(readFileSync('public/zones/index.json')).zones;
const jobId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const job = state => ({ jobId, zoneId: zones[1].id, label: 'Offline browser fixture', state, message: state === 'failed' ? 'Injected compilation failure' : `Fixture ${state}`, createdAt: Date.now(), updatedAt: Date.now(), ...(state === 'ready' ? { result: { entry: zones[1], cached: true, warnings: [] } } : {}) });
const route = (path, body) => evaluate(`window.__generationReplies[${JSON.stringify(path)}]=${JSON.stringify(body)}`);
const state = () => evaluate('({...document.querySelector("canvas").dataset,canvases:document.querySelectorAll("canvas").length})');
const observations = [];
try {
  run('open', base);
  for (const [mode, w, h] of [['desktop',1440,900],['tablet-portrait-emulation',820,1180]]) {
    run('set', 'viewport', String(w), String(h)); run('open', `${base}/?zone=${zones[0].id}&qa=1`); run('wait', '[data-physics-state="paused"]');
    click('Drive'); click('Locations & tools'); run('snapshot', '-i');
    click('Coordinates'); run('fill', '[aria-label="Latitude"]', '52.2'); run('fill', '[aria-label="Longitude"]', '0.12');
    const before = state();
    evaluate(`(()=>{const original=window.fetch;window.__generationReplies={};window.fetch=async(...args)=>{const path=new URL(args[0],location.href).pathname.replace('/api/zone-generation','');if(Object.hasOwn(window.__generationReplies,path)){const body=window.__generationReplies[path];await new Promise(r=>setTimeout(r,200));if(body===null)throw new TypeError('Injected connection loss');return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});}return original(...args)}})()`);
    route('/jobs', job('compiling')); route(`/jobs/${jobId}`, null);
    click('Build this location'); run('wait', '[data-generation-notice="compiling"]'); click('Close workspace');
    assert(evaluate('document.querySelector(".drive-primary").disabled'), 'Build did not disable resume');
    assert(state().physicsSteps === before.physicsSteps && state().zoneSlug === before.zoneSlug, 'Build advanced or replaced existing simulation');
    click('Locations & tools'); run('wait', '.generation-connection'); run('snapshot', '-i');
    assert(evaluate('sessionStorage.getItem("zone-generation-job")') === jobId, 'Lost connection discarded job identity');
    const lost = state();
    route(`/jobs/${jobId}`, job('failed')); click('Reconnect'); run('wait', '[data-generation-notice="failed"]');
    assert(state().zoneSlug === before.zoneSlug && state().physicsSteps === before.physicsSteps, 'Failure destroyed or moved loaded vehicle');
    const screenshot = join(output, `${mode}-failure.png`); run('screenshot', screenshot);
    click('Dismiss generation notice'); click('Close workspace'); click('Resume driving');
    assert(state().drivingMode === 'driving', 'Failure did not allow explicit resume');
    click('Locations & tools');
    route(`/jobs/${jobId}`, job('compiling')); route(`/jobs/${jobId}/cancel`, job('cancelled'));
    click('Build this location'); run('wait', '[data-generation-notice="compiling"]'); click('Cancel'); run('wait', '[data-generation-notice="cancelled"]');
    assert(state().zoneSlug === before.zoneSlug, 'Cancellation replaced loaded cell'); click('Dismiss generation notice');
    route('/jobs', job('ready')); click('Build this location');
    run('wait', `[data-zone-slug="${zones[1].id}"][data-zone-status="ready"]`); run('wait', '[data-physics-state="paused"]');
    const replacement = state(); assert(replacement.canvases === 1 && replacement.drivingMode === 'inspect' && replacement.physicsSteps === '0' && replacement.vehicleResets === '0', 'Replacement did not create a fresh neutral paused simulation');
    assert(run('get', 'url').includes('qa=1'), 'Navigation lost QA');
    assert(!run('errors'), 'Unexpected page exception');
    observations.push({ mode, evidence: 'browser fetch stubs with JSON response headers; no live provider acquisition', before, lost, replacement, screenshot, outcomes: ['build blocks driving', 'lost connection keeps job and loaded cell', 'reconnect/failure retains paused car', 'explicit resume after failure', 'cancel retains cell', 'success replaces with fresh paused neutral world'] });
    run('network', 'unroute'); console.log(`${mode}: build, outage, reconnect, failure, resume, cancel and replacement passed`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify({ base, checkedAt: new Date().toISOString(), browser: evaluate('navigator.userAgent'), observations }, null, 2) + '\n');
} catch(error) { console.log(run('snapshot','-i')); console.log(evaluate('document.body.innerText')); run('screenshot',join(output,'failure-debug.png')); throw error; } finally { run('close'); }
