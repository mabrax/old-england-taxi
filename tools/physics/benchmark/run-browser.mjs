/** One production-game workload; no keyboard/mouse driving, screenshots, video or forced GC. */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { cpus, release, platform, loadavg } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { installQualificationProtocol } from '../qualification-protocol.mjs';
import { installBenchmarkCapture } from './capture-page.mjs';
import { summarizeTrace } from './trace-summary.mjs';
const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE ?? 'puppeteer');
const [mode = 'measure', base = 'http://127.0.0.1:4193', destination] = process.argv.slice(2);
if (!['off', 'measure', 'trace'].includes(mode)) throw Error('Mode must be off, measure or trace');
if (!destination) throw Error('Supply a NEW output directory; existing evidence is never overwritten');
const output = resolve(destination);
mkdirSync(output, { recursive: false });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtureBytes = readFileSync('public/benchmarks/chicago-loop-v1.json'), fixture = JSON.parse(fixtureBytes);
const headless = process.env.HEADED !== '1';
const deadlineMs = 180000, maxTraceBytes = 512 * 1024 * 1024;
const bounded = async (promise, ms, label) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label)), ms); })]); }
  finally { clearTimeout(timer); }
};
const report = { version: 1, runId: randomUUID(), checkedAt: new Date().toISOString(), mode, headless, base,
  scope: headless ? 'headless production-loop verification; not displayed-device acceptance' : 'displayed Chrome production-loop benchmark',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTreeDiffSha256: sha(execFileSync('git', ['diff', 'HEAD'])),
  sourceFiles: Object.fromEntries(execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n').filter(name => /^(src\/|tools\/physics\/|package(-lock)?\.json$)/.test(name)).sort().map(name => [name, sha(readFileSync(name))])),
  fixture: { id: fixture.id, sha256: sha(fixtureBytes), artifact: fixture.artifact },
  runnerSha256: sha(readFileSync(new URL(import.meta.url))), captureSha256: sha(readFileSync(new URL('./capture-page.mjs', import.meta.url))),
  guardSha256: sha(readFileSync(new URL('../qualification-protocol.mjs', import.meta.url))),
  build: Object.fromEntries(readdirSync('dist/assets').map(name => [name, sha(readFileSync('dist/assets/' + name))])),
  os: { platform: platform(), release: release(), cpu: cpus()[0].model, loadBefore: loadavg() },
  viewport: fixture.viewport, workload: process.env.BENCHMARK_WORKLOAD ?? 'unspecified; do not infer an idle host',
  deadlineMs, noScreenshotsDuringRun: true, errors: [] };
const save = () => writeFileSync(output + '/results.json', JSON.stringify(report, null, 2) + '\n');
save();
let browser, page, cdp, tracing = false;
try {
  const launchArgs = ['--enable-precise-memory-info'];
  if (!headless) launchArgs.push('--window-size=1460,1020');
  if (process.env.CHROME_NO_SANDBOX === '1') launchArgs.push('--no-sandbox');
  browser = await puppeteer.launch({ browser: 'chrome', executablePath: process.env.BROWSER_PATH ?? '/usr/bin/google-chrome', headless, args: launchArgs, defaultViewport: fixture.viewport, protocolTimeout: deadlineMs + 10000 });
  report.browser = await browser.version();
  page = await browser.newPage();
  await page.evaluateOnNewDocument(installQualificationProtocol);
  await page.evaluateOnNewDocument(installBenchmarkCapture, mode !== 'off');
  // No generation/acquisition or remote requests enter the prepared workload.
  await page.setRequestInterception(true);
  page.on('request', request => {
    const u = new URL(request.url());
    if (u.origin !== new URL(base).origin || u.pathname.startsWith('/api/')) request.abort(); else request.continue();
  });
  page.on('pageerror', error => { if (report.errors.length < 100) report.errors.push(String(error)); });
  page.on('error', error => { if (report.errors.length < 100) report.errors.push(String(error)); });
  await page.goto(`${base}/?zone=${fixture.artifact.id}&benchmark=${fixture.id}${mode === 'off' ? '' : '&qualify=1'}`, { waitUntil: 'load', timeout: 15000 });
  await page.bringToFront();
  await page.waitForFunction(() => window.__drivingBenchmark && document.querySelector('canvas')?.dataset.vehicleStatus === 'ready', { polling: 100, timeout: 15000 });
  report.renderer = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, renderer: gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), vendor: gl.getParameter(ext?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR), hidden: document.hidden, hasFocus: document.hasFocus() };
  });
  cdp = await page.createCDPSession();
  for (const [name, hash] of Object.entries(report.build)) {
    const response = await fetch(new URL('/assets/' + name, base), { signal: AbortSignal.timeout(10000) });
    if (!response.ok || sha(Buffer.from(await response.arrayBuffer())) !== hash) throw Error('Preview build does not match local dist: ' + name);
  }
  report.servedBuildVerified = true;
  await cdp.send('Performance.enable');
  const metricsBefore = await cdp.send('Performance.getMetrics');
  if (mode === 'trace') {
    // Omit screenshot categories. Buffer and output limits fail explicitly on data loss.
    report.traceConfig = { recordMode: 'recordUntilFull', traceBufferSizeInKb: 131072,
      includedCategories: ['devtools.timeline', 'v8.execute', 'blink.user_timing', 'toplevel', 'cc', 'gpu', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'disabled-by-default-devtools.timeline.stack', 'disabled-by-default-v8.cpu_profiler'],
      excludedCategories: ['*', 'disabled-by-default-devtools.screenshot'] };
    await cdp.send('Tracing.start', { transferMode: 'ReturnAsStream', streamFormat: 'json', traceConfig: report.traceConfig });
    tracing = true;
    await cdp.send('Tracing.recordClockSyncMarker', { syncId: report.runId });
  }
  save();
  report.replay = await bounded(page.evaluate(() => new Promise((resolve, reject) => {
    const done = () => resolve(window.__drivingBenchmark.snapshot());
    window.addEventListener('benchmark:measure-end', done, { once: true });
    window.addEventListener('benchmark:invalid', done, { once: true });
    try { window.__drivingBenchmark.start(); } catch (error) { reject(error); }
  })), deadlineMs, 'External wall-clock deadline exceeded; run incomplete');
  report.metrics = { scope: 'entire replay including fixed warm-up; identical counters enabled in all modes', before: metricsBefore.metrics, after: (await cdp.send('Performance.getMetrics')).metrics };
} catch (error) { report.failure = String(error); }
finally {
  if (tracing) {
    try {
      const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
      await bounded(cdp.send('Tracing.end'), 10000, 'Trace stop timed out');
      const trace = await bounded(complete, 15000, 'Trace flush timed out');
      report.trace = { dataLossOccurred: trace.dataLossOccurred, bytes: 0, path: output + '/trace.json' };
      const file = openSync(report.trace.path, 'wx');
      try {
        for (;;) {
          const chunk = await bounded(cdp.send('IO.read', { handle: trace.stream, size: 1024 * 1024 }), 10000, 'Trace read timed out');
          const bytes = Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8');
          if (report.trace.bytes + bytes.length > maxTraceBytes) throw Error('Trace output size limit exceeded');
          writeSync(file, bytes); report.trace.bytes += bytes.length;
          if (chunk.eof) break;
        }
      } finally { closeSync(file); await cdp.send('IO.close', { handle: trace.stream }); }
      report.trace.sha256 = sha(readFileSync(report.trace.path));
      report.trace.summary = summarizeTrace(JSON.parse(readFileSync(report.trace.path, 'utf8')), fixture.measuredSteps);
    } catch (error) { report.traceFailure = String(error); }
  }
  if (page) {
    try {
      const final = await bounded(page.evaluate(() => ({ replay: window.__drivingBenchmark?.snapshot(), capture: window.__benchmarkCapture,
        state: { ...document.querySelector('canvas')?.dataset }, canvases: document.querySelectorAll('canvas').length,
        hidden: document.hidden, hasFocus: document.hasFocus() })), 3000, 'Final page snapshot unavailable');
      report.replay = final.replay; report.final = { ...final, capture: undefined };
      writeFileSync(output + '/samples.json', JSON.stringify(final.capture) + '\n');
      report.capture = { protocol: final.capture?.protocol, droppedRecords: final.capture?.droppedRecords, errors: final.capture?.errors };
      const stats = xs => { const values = xs.map(x => x.durationMs).sort((a, b) => a - b); return { count: values.length, p50: values[Math.ceil(values.length * .5) - 1] ?? null, p95: values[Math.ceil(values.length * .95) - 1] ?? null, p99: values[Math.ceil(values.length * .99) - 1] ?? null, max: values.at(-1) ?? null }; };
      report.timings = Object.fromEntries(['step', 'frame', 'raf'].map(key => [key, stats(final.capture?.[key] ?? [])]));
      const t = report.timings, r = report.replay?.timing ?? {};
      report.numericBudgets = mode === 'off' ? null : {
        step: t.step.count > 0 && t.step.p95 <= 2 && t.step.p99 <= 4,
        frame: t.frame.count > 0 && t.frame.p95 <= 16.7,
        raf: t.raf.count > 0 && t.raf.p95 <= 33.4 && t.raf.p99 <= 50,
        dropped: Number.isFinite(r.droppedMs) && report.replay?.measuredWallMs > 0 && r.droppedMs / report.replay.measuredWallMs <= .01
      };
      report.validWorkload = !!report.replay?.accepted && !!report.capture.protocol?.accepted && !report.failure && !report.traceFailure && !report.trace?.dataLossOccurred &&
        (mode !== 'trace' || report.trace?.summary?.valid === true) &&
        report.capture.droppedRecords === 0 && !report.capture.errors?.length && !report.errors.length && final.canvases === 1 && +final.state.vehicleRecoveries === 0 && +final.state.vehicleResets === 0 &&
        report.replay.resources?.bodies === 1 && report.replay.resources?.controllers === 1 && report.replay.resources?.colliders === 7;
      report.numericBudgetsMet = report.numericBudgets ? Object.values(report.numericBudgets).every(Boolean) : null;
      report.acceptance = { validWorkload: report.validWorkload, numericBudgetsMet: report.numericBudgetsMet, qualificationStageClosed: false };
    } catch (error) { report.finalSnapshotFailure = String(error); report.validWorkload = false; }
  }
  report.os.loadAfter = loadavg(); save();
  if (browser) await bounded(browser.close(), 10000, 'Browser close timed out').catch(error => { report.closeFailure = String(error); save(); });
}
console.log(JSON.stringify({ output, mode, validWorkload: report.validWorkload, numericBudgetsMet: report.numericBudgetsMet, failure: report.failure, replay: report.replay && { phase: report.replay.phase, steps: report.replay.step, failure: report.replay.failure } }));
if (!report.validWorkload || report.numericBudgetsMet === false) process.exitCode = 1;
