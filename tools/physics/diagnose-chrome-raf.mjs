// Bounded display-backend comparison. Diagnostic only, not qualification timing.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { bounded } from './qualification-support.mjs';
const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE ?? 'puppeteer');
const [platform, kind, destination, base = 'http://127.0.0.1:4196'] = process.argv.slice(2);
if (!['default', 'x11', 'wayland'].includes(platform) || !['minimal', 'app'].includes(kind) || !destination) throw Error('Usage: default|x11|wayland minimal|app NEW_DIRECTORY [base]');
const output = resolve(destination); mkdirSync(output, { recursive: false });
const report = { diagnosticOnly: true, platform, kind, checkedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runnerSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
  hostSession: process.env.XDG_SESSION_TYPE, samples: [], errors: [] };
const save = () => writeFileSync(output + '/results.json', JSON.stringify(report, null, 2) + '\n');
let browser;
try {
  browser = await puppeteer.launch({ executablePath: process.env.BROWSER_PATH ?? '/usr/bin/google-chrome', headless: false,
    args: ['--window-size=1460,1020', ...(platform === 'default' ? [] : [`--ozone-platform=${platform}`])],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 }, protocolTimeout: 15000 });
  report.browser = await browser.version(); report.launchArgs = browser.process().spawnargs;
  const context = await browser.createBrowserContext(), page = await context.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  await page.evaluateOnNewDocument(() => {
    const q = window.__rafDiagnostic = { raf: 0, timer: 0, lastRaf: null, lastTimer: null, events: [] };
    const tick = now => { q.raf++; q.lastRaf = now; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    setInterval(() => { q.timer++; q.lastTimer = performance.now(); }, 100);
    for (const type of ['focus', 'blur', 'visibilitychange']) window.addEventListener(type, () => q.events.push({ type, at: performance.now(), hidden: document.hidden, focus: document.hasFocus() }));
  });
  await page.bringToFront();
  if (kind === 'minimal') {
    await page.goto('data:text/html,<h1>Independent animation-frame diagnostic</h1><p>No application, Three.js, Rapier or WebGL.</p>');
  } else {
    const zone = JSON.parse(readFileSync('public/zones/index.json')).zones[3];
    await page.goto(`${base}/?zone=${zone.id}&qualify=1`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.vehiclePose, { timeout: 15000, polling: 100 });
    const point = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Drive'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(point.x, point.y); await page.keyboard.down('w');
  }
  for (let i = 0; i < 16; i++) {
    report.samples.push(await bounded(page.evaluate(() => ({ at: performance.now(), ...window.__rafDiagnostic,
      hidden: document.hidden, focus: document.hasFocus(), viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      state: { ...document.querySelector('canvas')?.dataset } })), 3000, 'Diagnostic evaluation deadline'));
    save(); if (i < 15) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (kind === 'app') await page.keyboard.up('w');
  const cdp = await browser.target().createCDPSession();
  report.systemInfo = await cdp.send('SystemInfo.getInfo');
} catch (error) { report.error = String(error); process.exitCode = 1; }
finally { save(); if (browser) await bounded(browser.close(), 10000, 'Browser close deadline'); }
console.log(JSON.stringify({ output, error: report.error, first: report.samples[0]?.raf, last: report.samples.at(-1)?.raf }));
