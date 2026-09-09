/** Short functional checks only; these interrupted runs are never performance evidence. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { installQualificationProtocol } from '../qualification-protocol.mjs';
import { installBenchmarkCapture } from './capture-page.mjs';
const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE ?? 'puppeteer');
const base = process.argv[2] ?? 'http://127.0.0.1:4193', output = process.argv[3];
if (!output) throw Error('Supply a new output directory');
mkdirSync(output);
const f = JSON.parse(readFileSync('public/benchmarks/chicago-loop-v1.json'));
const url = `${base}/?zone=${f.artifact.id}&benchmark=${f.id}&qualify=1`;
const browser = await puppeteer.launch({ executablePath: process.env.BROWSER_PATH ?? '/usr/bin/google-chrome', headless: true, defaultViewport: f.viewport, args: process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : [] });
const report = { browser: await browser.version(), headless: true, performanceEvidence: false, checks: [] };
try {
  for (const kind of ['hidden tab', 'user input', 'viewport change', 'second start']) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(installQualificationProtocol);
    await page.evaluateOnNewDocument(installBenchmarkCapture, true);
    await page.goto(url); await page.bringToFront();
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.vehicleStatus === 'ready');
    await page.evaluate(() => window.__drivingBenchmark.start());
    await page.waitForFunction(() => window.__drivingBenchmark.snapshot().step > 5);
    if (kind === 'hidden tab') {
      const other = await browser.newPage(); await other.bringToFront();
      await page.waitForFunction(() => window.__drivingBenchmark.snapshot().phase === 'invalid', { polling: 100 });
      await other.close(); await page.bringToFront();
    } else if (kind === 'user input') await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })));
    else if (kind === 'viewport change') await page.setViewport({ ...f.viewport, width: 1280 });
    else assert.match(await page.evaluate(() => { try { window.__drivingBenchmark.start(); } catch (error) { return String(error); } }), /fresh ready foreground/);
    if (kind === 'second start') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForFunction(() => window.__drivingBenchmark.snapshot().phase === 'invalid', { polling: 100 });
    const result = await page.evaluate(() => ({ replay: window.__drivingBenchmark.snapshot(), protocol: window.__benchmarkCapture.protocol }));
    assert.equal(result.replay.accepted, false); assert.equal(result.protocol.accepted, false);
    const steps = result.replay.step;
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(await page.evaluate(() => window.__drivingBenchmark.snapshot().step), steps);
    report.checks.push({ kind, result }); await page.close();
  }
  const page = await browser.newPage(); await page.goto(base);
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.vehicleStatus === 'ready');
  assert.equal(await page.evaluate(() => !!window.__drivingBenchmark), false);
  report.checks.push({ kind: 'ordinary driving exposes no benchmark control', result: 'pass' });
  await page.goto(url + '&qa=1'); await page.waitForSelector('.scene-error');
  assert.equal(await page.evaluate(() => !!window.__drivingBenchmark), false);
  report.checks.push({ kind: 'QA workload rejected', result: 'pass' });
  await page.setRequestInterception(true);
  page.on('request', request => request.url().includes('/benchmarks/') ? request.respond({ status: 200, contentType: 'application/json', body: '{}' }) : request.continue());
  await page.goto(url); await page.waitForSelector('.scene-error');
  assert.match(await page.$eval('.scene-error', el => el.textContent), /hash mismatch/);
  report.checks.push({ kind: 'modified fixture rejected', result: 'pass' });
  report.result = 'pass';
} catch (error) { report.failure = String(error); throw error; }
finally { writeFileSync(output + '/results.json', JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
console.log(JSON.stringify({ output, checks: report.checks.length, result: report.result }));
