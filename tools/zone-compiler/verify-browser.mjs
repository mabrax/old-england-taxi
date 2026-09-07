// Run against an already-started production preview: npm run zone:browser
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = process.argv[2] ?? 'http://127.0.0.1:4175';
const zones = JSON.parse(readFileSync(new URL('../../public/zones/index.json', import.meta.url))).zones;
const output = mkdtempSync(join(tmpdir(), 'zone-browser-'));
const session = `zone-qa-${process.pid}`;
const run = (...args) => execFileSync('npx', ['--yes', 'agent-browser', '--session', session, ...args], { encoding: 'utf8', timeout: 60_000 }).trim();
const evaluate = code => JSON.parse(run('eval', code));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const observations = [];
try {
  run('open', base);
  run('wait', '[data-zone-status="ready"]');
  for (const mode of ['desktop', 'mobile']) {
    if (mode === 'desktop') run('set', 'viewport', '1440', '900');
    else run('set', 'device', 'iPhone 12');
    for (const zone of zones) {
      run('open', `${base}/?zone=${zone.id}&qa=1`);
      run('wait', '[data-zone-status="ready"]');
      const snapshot = run('snapshot', '-i');
      const state = evaluate(`({status:document.querySelector('[data-zone-status]').dataset.zoneStatus, id:document.querySelector('canvas').dataset.zoneSlug, qaLines:Number(document.querySelector('canvas').dataset.qaLines), roadTriangles:Number(document.querySelector('canvas').dataset.roadTriangles), buildingTriangles:Number(document.querySelector('canvas').dataset.buildingTriangles), canvases:document.querySelectorAll('canvas').length, overflow:document.documentElement.scrollWidth>innerWidth, width:innerWidth,height:innerHeight,dpr:devicePixelRatio, qaColor:getComputedStyle(document.querySelector('.qa-controls')).color})`);
      assert(state.id === zone.id && state.status === 'ready' && state.canvases === 1 && state.qaLines > 0 && !state.overflow, `Failed ${mode} ${zone.id}`);
      assert(state.roadTriangles + state.buildingTriangles === zone.summary.triangles, 'Displayed mesh count differs from catalogue');
      assert(!run('errors') && !run('console'), `Browser errors for ${zone.id}`);
      const sourceRef = snapshot.match(/checkbox "Source outlines"[^\n]*ref=(e\d+)/)?.[1];
      const generatedRef = snapshot.match(/checkbox "Generated geometry"[^\n]*ref=(e\d+)/)?.[1];
      assert(sourceRef && generatedRef, 'Missing QA controls');
      run('uncheck', `@${sourceRef}`);
      assert(evaluate('document.querySelector("canvas").dataset.sourceVisible') === 'false', 'Source toggle failed');
      run('check', `@${sourceRef}`);
      run('uncheck', `@${generatedRef}`);
      assert(evaluate('document.querySelector("canvas").dataset.generatedVisible') === 'false', 'Generated toggle failed');
      run('check', `@${generatedRef}`);
      run('click', '.reset-button');
      if (mode === 'mobile') run('scroll', 'up', '1000');
      const screenshot = join(output, `${mode}-${zone.id}.png`);
      run('screenshot', screenshot);
      observations.push({ mode, label: zone.label, ...state, toggles: 'pass', reset: 'pass', screenshot });
      console.log(`${mode}: ${zone.label} READY, QA toggles/reset and counts passed`);
    }
  }
  // Exercise the actual catalogue selector, retaining QA mode across navigation.
  run('select', 'select[aria-label="Prepared zone"]', zones[0].id);
  run('wait', `[data-zone-slug="${zones[0].id}"][data-zone-status="ready"]`);
  assert(run('get', 'url').includes('qa=1'), 'Selector lost QA mode');
  const id = zones[0].id;
  for (const failure of ['missing-id', 'artifact-schema', 'qa-hash']) {
    if (failure === 'artifact-schema') run('network', 'route', `${base}/zones/*.zone.json`, '--body', '{}');
    if (failure === 'qa-hash') run('network', 'route', `${base}/zones/*.qa.json`, '--body', '{}');
    const url = failure === 'missing-id' ? `${base}/?zone=missing` : failure === 'artifact-schema' ?
      `${base}/?artifact=/zones/${id}.zone.json` : `${base}/?zone=${id}&qa=1`;
    console.log(`Checking failure: ${failure}`);
    run('open', url);
    run('wait', '[data-zone-status="error"]');
    run('snapshot', '-i');
    const state = evaluate(`({canvases:document.querySelectorAll('canvas').length,resetDisabled:document.querySelector('.reset-button').disabled,error:document.querySelector('[role="alert"]').textContent,overflow:document.documentElement.scrollWidth>innerWidth})`);
    assert(state.canvases === 0 && state.resetDisabled && !state.overflow, `Error state failed: ${failure}`);
    observations.push({ failure, ...state });
    run('network', 'unroute');
  }
  run('open', `${base}/?artifact=/zones/${id}.zone.json&qa=1`);
  run('wait', '[data-zone-status="ready"]');
  assert(evaluate('document.querySelector("canvas").dataset.zoneSlug') === id, 'Explicit URL recovery failed');
  writeFileSync(join(output, 'results.json'), JSON.stringify({ base, observations, selector: 'pass', explicitUrlRecovery: 'pass' }, null, 2));
  console.log(`Browser evidence: ${output}`);
} finally { run('close'); }
