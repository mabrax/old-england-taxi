/** Read a completed Chrome trace. No browser or live-capture interaction. */
export function summarizeTrace(trace, expectedSteps = 7200) {
  const events = trace.traceEvents ?? [];
  const start = events.find(e => e.name === 'benchmark:measure-start');
  const end = events.find(e => e.name === 'benchmark:measure-end' && e.pid === start?.pid && e.ts >= start?.ts);
  const within = events.filter(e => start && end && e.pid === start.pid && e.ts >= start.ts && e.ts <= end.ts);
  // Chrome encodes zero-duration User Timing measures as nestable async
  // instants (n). Count those too, but reject unclosed or unmatched spans.
  const measures = name => {
    const selected = events.filter(e => e.name === name && e.pid === start?.pid && e.ts <= end?.ts)
      .sort((a, b) => a.ts - b.ts || (a.ph === 'e' ? -1 : b.ph === 'e' ? 1 : 0));
    const open = new Map();
    let count = 0, complete = true;
    for (const event of selected) {
      const key = JSON.stringify([event.pid, event.tid, event.id2, event.id]);
      const measured = event.ts >= start.ts;
      if (event.ph === 'n' && measured) count++;
      if (event.ph === 'b') {
        const stack = open.get(key) ?? [];
        stack.push(event.ts); open.set(key, stack);
        if (measured) count++;
      } else if (event.ph === 'e') {
        // Chrome can reuse async IDs after a measure closes. Match in time
        // order, including a warm-up frame whose end crosses measure-start.
        const began = open.get(key)?.pop();
        if (measured && began === undefined) complete = false;
      }
    }
    for (const stack of open.values()) if (stack.some(ts => ts >= start.ts)) complete = false;
    return { count, complete };
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
