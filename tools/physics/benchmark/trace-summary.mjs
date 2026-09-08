/** Read a completed Chrome trace. No browser or live-capture interaction. */
export function summarizeTrace(trace, expectedSteps = 7200) {
  const events = trace.traceEvents ?? [];
  const start = events.find(e => e.name === 'benchmark:measure-start');
  const end = events.find(e => e.name === 'benchmark:measure-end' && e.pid === start?.pid && e.ts >= start?.ts);
  const within = events.filter(e => start && end && e.pid === start.pid && e.ts >= start.ts && e.ts <= end.ts);
  const steps = within.filter(e => e.name === 'driveability:step' && e.ph === 'b');
  const frames = within.filter(e => e.name === 'driveability:frame' && e.ph === 'b');
  const screenshots = events.filter(e => /screenshot/i.test(e.name ?? '')).length;
  const longMainTasks = within.filter(e => e.tid === start?.tid && e.ph === 'X' && /RunTask|ProcessTaskFromWorkQueue/.test(e.name ?? '') && e.dur >= 50000)
    .map(e => ({ atMs: (e.ts - start.ts) / 1000, durationMs: e.dur / 1000, name: e.name })).sort((a, b) => b.durationMs - a.durationMs);
  return { events: events.length, measuredStartUs: start?.ts ?? null, measuredEndUs: end?.ts ?? null,
    measuredStepSpans: steps.length, measuredFrameSpans: frames.length, screenshotEvents: screenshots,
    longestMainTasks: longMainTasks.slice(0, 20), longMainTaskCount: longMainTasks.length,
    valid: !!start && !!end && steps.length === expectedSteps && frames.length > 0 && screenshots === 0 };
}
