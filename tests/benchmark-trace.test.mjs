import { describe, expect, it } from 'vitest';
import { summarizeTrace } from '../tools/physics/benchmark/trace-summary.mjs';
const event = (name, ph, ts, id = '1') => ({ name, ph, ts, pid: 2, tid: 3, id2: { local: id } });
const trace = () => ({ traceEvents: [
  event('benchmark:measure-start', 'I', 100),
  event('driveability:step', 'b', 110), event('driveability:step', 'e', 120),
  event('driveability:step', 'n', 125, '2'),
  event('driveability:frame', 'b', 105), event('driveability:frame', 'e', 130),
  event('benchmark:measure-end', 'I', 140)
] });
describe('saved Chrome trace validation', () => {
  it('counts zero-duration measures alongside completed spans', () => {
    expect(summarizeTrace(trace(), 2)).toMatchObject({ valid: true, measuredStepSpans: 2, measuredFrameSpans: 1, screenshotEvents: 0 });
  });
  it('pairs reused async identifiers in timestamp order', () => {
    const input = trace();
    input.traceEvents.push(event('driveability:step', 'e', 135), event('driveability:step', 'b', 120));
    expect(summarizeTrace(input, 3).valid).toBe(true);
  });
  it('rejects a missing end even when the number of starts matches', () => {
    const input = trace(); input.traceEvents.splice(2, 1);
    expect(summarizeTrace(input, 2).valid).toBe(false);
  });
  it('rejects an unmatched end and incomplete measurement interval', () => {
    const input = trace(); input.traceEvents[2].id2.local = 'unmatched';
    expect(summarizeTrace(input, 2).valid).toBe(false);
    expect(summarizeTrace({ traceEvents: trace().traceEvents.slice(0, -1) }, 2).valid).toBe(false);
  });
  it('rejects screenshot capture and excludes warm-up measures', () => {
    const input = trace(); input.traceEvents.unshift(event('driveability:step', 'n', 50));
    input.traceEvents.push(event('driveability:frame', 'b', 90, 'warmup'), event('driveability:frame', 'e', 102, 'warmup'));
    expect(summarizeTrace(input, 2).valid).toBe(true);
    input.traceEvents.push(event('Screenshot', 'I', 115));
    expect(summarizeTrace(input, 2).valid).toBe(false);
  });
});
