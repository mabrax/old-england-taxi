import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bounded, memoryAcceptance } from './qualification-support.mjs';

test('external deadline rejects when the page never resolves', async () => {
  await assert.rejects(bounded(new Promise(() => {}), 10, 'renderer stalled'), /renderer stalled/);
  assert.equal(await bounded(Promise.resolve(42), 100, 'deadline'), 42);
});
test('missing or partial heap samples cannot pass', () => {
  for (const samples of [[], Array.from({ length: 19 }, () => ({ heap: { used: 10 } })), Array.from({ length: 20 }, () => ({ heap: null }))]) {
    assert.equal(memoryAcceptance(samples).result, 'unmeasured');
  }
});
test('an intermediate heap limit breach fails even if the final heap recovers', () => {
  const samples = Array.from({ length: 20 }, () => ({ heap: { used: 40 * 1024 ** 2 } }));
  samples[10].heap.used = 257 * 1024 ** 2;
  assert.equal(memoryAcceptance(samples).postGcHeap, false);
  assert.equal(memoryAcceptance(samples).growthPass, true);
});
test('cycle 5 to 20 growth retains the original exact limit', () => {
  const samples = Array.from({ length: 20 }, () => ({ heap: { used: 40 * 1024 ** 2 } }));
  samples[19].heap.used += 20 * 1024 ** 2;
  assert.equal(memoryAcceptance(samples).growthPass, true);
  samples[19].heap.used++;
  assert.equal(memoryAcceptance(samples).growthPass, false);
});
