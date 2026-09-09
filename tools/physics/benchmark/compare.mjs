/** Compare saved runs only; never launches a browser or silently pools different fixtures. */
import { readFileSync } from 'node:fs';
const paths = process.argv.slice(2);
if (paths.length < 2) throw Error('Supply at least two results.json files from the same build/scenario/browser');
const reports = paths.map(path => ({ path, ...JSON.parse(readFileSync(path, 'utf8')) }));
const signature = r => JSON.stringify([r.fixture, r.build, r.runnerSha256, r.captureSha256, r.guardSha256, r.browser, r.headless, r.renderer, r.viewport, r.os.platform, r.os.release, r.os.cpu, r.workload]);
if (reports.some(r => !r.validWorkload)) throw Error('Invalid or incomplete workloads cannot enter a performance comparison');
if (reports.some(r => signature(r) !== signature(reports[0]))) throw Error('Scenario/build/browser/device/workload mismatch');
const metric = (r, name) => {
  const before = r.metrics.before.find(m => m.name === name)?.value, after = r.metrics.after.find(m => m.name === name)?.value;
  return before === undefined || after === undefined ? null : (after - before) * 1000;
};
const baseline = reports.find(r => r.mode === 'off');
const baselineTask = baseline && metric(baseline, 'TaskDuration');
console.log(JSON.stringify({ scope: 'Paired observations, not a causal overhead estimate; repeat/interleave modes before generalizing. TaskDuration includes the fixed warm-up.',
  runs: reports.map(r => ({ path: r.path, mode: r.mode, measuredWallMs: r.replay.measuredWallMs,
    taskMs: metric(r, 'TaskDuration'), taskDeltaVsOffMs: baselineTask === null || baselineTask === undefined ? null : metric(r, 'TaskDuration') - baselineTask,
    numericBudgetsMet: r.numericBudgetsMet, timings: r.timings, loadBefore: r.os.loadBefore, loadAfter: r.os.loadAfter })) }, null, 2));
