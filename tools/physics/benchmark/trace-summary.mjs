/** Read a completed Chrome trace. No browser or live-capture interaction. */
export function summarizeTrace(trace, expectedSteps = 7200) {
  const events = trace.traceEvents ?? [];
  const start = events.find(e => e.name === 'benchmark:measure-start');
  const end = events.find(e => e.name === 'benchmark:measure-end' && e.pid === start?.pid && e.ts >= start?.ts);
  const within = events.filter(e => start && end && e.pid === start.pid && e.ts >= start.ts && e.ts <= end.ts);
  // Chrome encodes zero-duration User Timing measures as nestable async
  // instants (n). Count those too, but reject unclosed or unmatched spans.
  const measures = name => {
    const selected = within.filter(e => e.name === name);
    const begins = selected.filter(e => e.ph === 'b'), ends = selected.filter(e => e.ph === 'e');
    const key = e => JSON.stringify([e.pid, e.tid, e.id2, e.id]);
    const closed = new Map(ends.map(e => [key(e), e.ts]));
    const opened = new Map(events.filter(e => e.name === name && e.ph === 'b').map(e => [key(e), e.ts]));
    return { count: begins.length + selected.filter(e => e.ph === 'n').length,
      // The frame containing measure-start began during warm-up; its end is
      // allowed here without counting that partial frame as a measured frame.
      complete: begins.every(e => closed.has(key(e)) && closed.get(key(e)) >= e.ts) &&
        ends.every(e => opened.has(key(e)) && opened.get(key(e)) <= e.ts) };
  };
  const steps = measures('driveability:step'), frames = measures('driveability:frame');
  const screenshots = events.filter(e => /screenshot/i.test(e.name ?? '')).length;
  const longMainTasks = within.filter(e => e.tid === start?.tid && e.ph === 'X' && /RunTask|ProcessTaskFromWorkQueue/.test(e.name ?? '') && e.dur >= 50000)
    .map(e => ({ atMs: (e.ts - start.ts) / 1000, durationMs: e.dur / 1000, name: e.name })).sort((a, b) => b.durationMs - a.durationMs);
  return { events: events.length, measuredStartUs: start?.ts ?? null, measuredEndUs: end?.ts ?? null,
    measuredStepSpans: steps.count, measuredFrameSpans: frames.count, measuresComplete: steps.complete && frames.complete, screenshotEvents: screenshots,
    longestMainTasks: longMainTasks.slice(0, 20), longMainTaskCount: longMainTasks.length,
    valid: !!start && !!end && steps.complete && frames.complete && steps.count === expectedSteps && frames.count > 0 && screenshots === 0 };
}
