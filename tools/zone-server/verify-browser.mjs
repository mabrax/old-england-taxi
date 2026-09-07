// This opt-in check uses live place search and may acquire one new 500 m zone.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = process.argv[2] ?? 'http://127.0.0.1:4175';
const output = mkdtempSync(join(tmpdir(), 'live-zone-browser-'));
const session = `live-zone-check-${process.pid}`;
const run = (...args) => execFileSync('npx', ['--yes', 'agent-browser', '--session', session, ...args], { encoding: 'utf8', timeout: 60_000 }).trim();
const evaluate = code => JSON.parse(run('eval', code));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const observations = [];
try {
  const catalogue = await (await fetch(`${base}/zones/index.json`)).json();
  const fixture = catalogue.zones.find(zone => zone.label === 'Chicago River North grid');
  run('open', `${base}/?zone=${fixture.id}&qa=1`);
  run('wait', '[data-zone-status="ready"]');
  run('fill', '#location-query', 'Shibuya Crossing, Tokyo');
  run('find', 'role', 'button', 'click', '--name', 'Find', '--exact');
  run('wait', '.location-results button');
  run('click', '.location-results button:first-child');
  run('select', 'select[aria-label="Cell size"]', '500');
  run('click', '.generate-button');
  // Wait in bounded intervals: a fresh provider request can take up to the worker deadline.
  let ready = false;
  for (const deadline = Date.now() + 165_000; Date.now() < deadline;) {
    try { run('wait', '--fn', 'document.querySelector(".card-heading h2")?.textContent.includes("Shibuya") && document.querySelector("[data-zone-status=ready]")'); ready = true; break; }
    catch { const error = evaluate('document.querySelector("[data-generation-state=failed]")?.textContent'); if (error) throw new Error(error); console.log('Live generation is still in progress.'); }
  }
  assert(ready, 'Live generation did not open its result');
  const id = evaluate('document.querySelector("canvas").dataset.zoneSlug');
  assert(id !== fixture.id, 'Generation left the prepared zone selected');
  assert(run('get', 'url').includes('qa=1'), 'Generation lost QA mode');
  observations.push({ check: 'place search → build → automatic navigation', result: 'pass', id });
  console.log('Place search, generation and automatic navigation passed.');
  for (const [mode, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    run('set', 'viewport', String(width), String(height));
    const state = evaluate('({id:document.querySelector("canvas").dataset.zoneSlug,status:document.querySelector("[data-zone-status]").dataset.zoneStatus,qaLines:Number(document.querySelector("canvas").dataset.qaLines),overflow:document.documentElement.scrollWidth>innerWidth,canvases:document.querySelectorAll("canvas").length})');
    assert(state.id === id && state.status === 'ready' && state.qaLines > 0 && !state.overflow && state.canvases === 1, `${mode} render failed`);
    run('find', 'label', 'Source outlines', 'check');
    run('find', 'label', 'Generated geometry', 'check');
    run('click', '.reset-button');
    evaluate('document.querySelector(".control-rail").scrollTop=0');
    const screenshot = join(output, `${mode}.png`); run('screenshot', screenshot);
    observations.push({ mode, ...state, screenshot });
  }
  assert(!run('errors'), 'Unexpected browser exception');
  run('find', 'role', 'button', 'click', '--name', 'Coordinates', '--exact');
  run('fill', 'input[aria-label="Latitude"]', '75');
  run('fill', 'input[aria-label="Longitude"]', '20');
  run('click', '.generate-button');
  run('wait', '[role="alert"]');
  assert(evaluate('document.querySelector("[role=alert]").textContent').includes('-75 and 75'), 'Coordinate bounds error was not shown');
  assert(!evaluate('document.querySelector(".generate-button").disabled'), 'Invalid input left the form stuck');
  observations.push({ check: 'unsupported coordinates and retry', result: 'pass' });

  // Block status responses while a real cached-zone verification runs on the server.
  const report = await (await fetch(`${base}/zones/${id}.report.json`)).json();
  run('fill', 'input[aria-label="Latitude"]', String(report.generation.latitude));
  run('fill', 'input[aria-label="Longitude"]', String(report.generation.longitude));
  run('select', 'select[aria-label="Cell size"]', '500');
  run('network', 'route', `${base}/api/zone-generation/jobs/*`, '--abort');
  run('click', '.generate-button');
  run('wait', '.reconnect-button');
  const pendingId = evaluate('sessionStorage.getItem("zone-generation-job")');
  assert(pendingId, 'Connection failure lost the job ID');
  assert(evaluate('document.querySelector(".generate-button").disabled'), 'A connection failure permitted duplicate submission');
  run('open', run('get', 'url'));
  run('wait', '.reconnect-button');
  assert(evaluate('sessionStorage.getItem("zone-generation-job")') === pendingId, 'Reload lost the active job');
  run('network', 'unroute');
  run('click', '.reconnect-button');
  run('wait', '--fn', '!sessionStorage.getItem("zone-generation-job") && document.querySelector("[data-zone-status=ready]")');
  const completed = await (await fetch(`${base}/api/zone-generation/jobs/${pendingId}`)).json();
  assert(completed.state === 'ready' && completed.result.cached, 'Cached verification did not finish');
  observations.push({ check: 'reload, connection loss, reconnect and cached result', source: 'real generation service with browser status requests temporarily blocked', result: 'pass', cached: completed.result.cached });
  run('eval', `sessionStorage.setItem('zone-generation-job','00000000-0000-0000-0000-000000000000')`);
  run('open', run('get', 'url'));
  run('wait', '[role="alert"]');
  assert(evaluate('document.querySelector("[role=alert]").textContent').includes('restarted'), 'Expired job was not explained');
  assert(evaluate('sessionStorage.getItem("zone-generation-job")') === null, 'Expired job blocked future work');
  observations.push({ check: 'service restart / missing job recovery', result: 'pass' });

  // A search can lose the server before a job exists. Reconnect must preserve the form
  // and only check connectivity, leaving the user in control of resubmission.
  run('set', 'viewport', '1440', '900');
  run('find', 'role', 'button', 'click', '--name', 'Place name', '--exact');
  const query = 'pelluco, puerto montt, los lagos, chile';
  run('fill', '#location-query', query);
  run('network', 'route', `${base}/api/zone-generation/search`, '--abort');
  run('find', 'role', 'button', 'click', '--name', 'Find', '--exact');
  run('wait', '.generation-connection');
  assert(evaluate('document.querySelector(".generation-connection").textContent').includes('local generation server'), 'Search connection loss was not explained');
  assert(evaluate('document.querySelector("#location-query").value') === query, 'Search failure lost the entered location');
  assert(evaluate('document.querySelector("[data-zone-status]").dataset.zoneStatus') === 'ready', 'Search failure removed the loaded map');
  run('screenshot', join(output, 'search-connection-loss.png'));
  run('network', 'unroute');
  run('click', '.reconnect-button');
  run('wait', '--fn', '!document.querySelector(".generation-connection") && !document.querySelector("#location-query").disabled');
  assert(evaluate('document.querySelector("#location-query").value') === query, 'Reconnect lost the entered location');
  assert(!evaluate('document.querySelector(".location-results") || sessionStorage.getItem("zone-generation-job")'), 'Reconnect unexpectedly replayed a search or build');
  run('find', 'role', 'button', 'click', '--name', 'Find', '--exact');
  run('wait', '.location-results button');
  assert(evaluate('document.querySelector(".location-results").textContent').includes('Pelluco'), 'Search did not recover');
  observations.push({ check: 'search connection loss, preserved query, explicit reconnect and successful retry', result: 'pass' });

  run('network', 'route', `${base}/api/zone-generation`, '--abort');
  run('open', run('get', 'url'));
  run('wait', '.generation-connection');
  run('network', 'unroute');
  run('click', '.reconnect-button');
  run('wait', '--fn', '!document.querySelector(".generation-connection") && !document.querySelector("#location-query").disabled');
  observations.push({ check: 'unavailable server at page load can reconnect without reloading', result: 'pass' });
  writeFileSync(join(output, 'results.json'), JSON.stringify({ base, checkedAt: new Date().toISOString(), observations }, null, 2));
  console.log(`Browser evidence: ${output}`);
} finally { run('close'); }
