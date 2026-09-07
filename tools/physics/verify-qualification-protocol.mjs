// Browser guard tests on a miniature DOM fixture, not application performance evidence.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { installQualificationProtocol } from './qualification-protocol.mjs';
const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE ?? 'puppeteer');
const output = resolve(process.argv[2] ?? '.zone-cache/phase-04-review-followup/protocol-browser.json');
mkdirSync(resolve(output, '..'), { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.BROWSER_PATH, headless: true, args: ['--no-sandbox'] });
const report = { checkedAt: new Date().toISOString(), browser: await browser.version(), appPerformanceEvidence: false, cases: [] };
try {
  for (const kind of ['deliberate reset', 'paused endpoint', 'transient pause before reset', 'hidden tab']) {
    const page = await browser.newPage();
    await page.setContent('<canvas data-driving-mode="driving" data-physics-status="running" data-vehicle-status="ready" data-physics-steps="120"></canvas>');
    await page.bringToFront(); await page.evaluate(installQualificationProtocol);
    await page.evaluate(() => window.__qualificationProtocol.start());
    await new Promise(resolve => setTimeout(resolve, 30));
    let rejection;
    if (kind === 'hidden tab') {
      const other = await browser.newPage(); await other.bringToFront();
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(await page.evaluate(() => document.hidden), true);
      await page.bringToFront(); await other.close();
    } else {
      rejection = await page.evaluate(async kind => {
        const api = window.__qualificationProtocol, d = document.querySelector('canvas').dataset;
        if (kind === 'deliberate reset') api.beginReset(1);
        d.drivingMode = 'paused'; d.physicsStatus = 'paused';
        if (kind !== 'transient pause before reset') await new Promise(resolve => setTimeout(resolve, 30));
        if (kind !== 'paused endpoint') { d.drivingMode = 'driving'; d.physicsStatus = 'running'; }
        try {
          if (kind === 'deliberate reset') api.endReset(1);
          else api.beginReset(28);
        } catch (error) { return String(error); }
      }, kind);
    }
    await new Promise(resolve => setTimeout(resolve, 30));
    const protocol = await page.evaluate(() => window.__qualificationProtocol.finish(true));
    assert.equal(protocol.accepted, kind === 'deliberate reset');
    if (kind.includes('pause')) assert.match(rejection, /protocol invalid/);
    report.cases.push({ kind, rejection, protocol, testResult: 'pass' });
    await page.close();
  }
  report.result = 'pass';
} catch (error) { report.error = String(error); throw error; }
finally { writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
