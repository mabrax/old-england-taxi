import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const source = new URL('./project.json', import.meta.url);
const data = JSON.parse(readFileSync(source, 'utf8'));
const ids = data.stages.map(stage => stage.id);
assert.equal(new Set(ids).size, ids.length, 'Stage IDs must be unique');
assert(ids.includes(data.currentStage) && ids.includes(data.nextStage), 'Current and next stages must exist');
if (data.next.targetStage) assert(ids.includes(data.next.targetStage), 'The active-task card must target an existing stage');
assert(/^\d{4}-\d{2}-\d{2}$/.test(data.synced), 'Use an explicit snapshot date');
for (const stage of data.stages) {
  assert(['complete', 'reviewed', 'open', 'next', 'planned'].includes(stage.state));
  assert.equal(stage.dimensions.length, 4, 'Keep delivery, review, acceptance and integration separate');
  assert(stage.source && stage.phases.length && stage.summary && stage.outcome);
}
const template = readFileSync(new URL('./template.html', import.meta.url), 'utf8');
assert.equal(template.split('__PROJECT_DATA__').length, 2, 'Template needs exactly one data slot');
const embedded = JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
const result = template.replace('__PROJECT_DATA__', embedded);
const output = new URL('./index.html', import.meta.url);
if (process.argv.includes('--check')) assert.equal(readFileSync(output, 'utf8'), result, 'Companion is stale; run node companion/build.mjs');
else writeFileSync(output, result);
console.log(`Companion ${process.argv.includes('--check') ? 'verified' : 'built'}: ${data.project}, ${data.stages.length} stages, snapshot ${data.synced}`);
