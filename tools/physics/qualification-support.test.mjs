import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bounded, memoryAcceptance, stableProcessMemory } from './qualification-support.mjs';

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
test('process exit during enumeration retains the failed sample and takes the first complete retry', () => {
  const samples = [{ pssBytes: null, errors: [{ error: 'ENOENT: child exited' }] }, { pssBytes: 900 }, { pssBytes: 100 }];
  let calls = 0;
  const result = stableProcessMemory(42, () => samples[calls++]);
  assert.equal(calls, 2); assert.equal(result.pssBytes, 900);
  assert.deepEqual(result.attempts, samples.slice(0, 2));
});
test('unreadable process memory stays unmeasured after three attempts', () => {
  let calls = 0;
  const result = stableProcessMemory(42, () => { calls++; return { pssBytes: null, errors: [{ error: 'unreadable' }] }; });
  assert.equal(calls, 3); assert.equal(result.pssBytes, null); assert.equal(result.attempts.length, 3);
});
test('unsupported OS does not retry or fabricate process memory', () => {
  let calls = 0;
  const result = stableProcessMemory(42, () => { calls++; return { pssBytes: null, reason: 'unsupported OS' }; });
  assert.equal(calls, 1); assert.equal(result.pssBytes, null);
});
