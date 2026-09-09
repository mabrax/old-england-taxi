/** Injected only into the isolated benchmark page, before its application loads. */
export function installBenchmarkCapture(sampling) {
  const limit = 50000;
  const data = { clock: 'page performance.now milliseconds', timeOrigin: performance.timeOrigin, step: [], frame: [], raf: [], events: [], errors: [], droppedRecords: 0, protocol: null, start: null, end: null };
  let active = false, lastRaf, observer;
  const append = (key, record) => { if (data[key].length < limit) data[key].push(record); else data.droppedRecords++; };
  const consume = entries => {
    for (const e of entries) {
      const key = e.name === 'driveability:step' ? 'step' : e.name === 'driveability:frame' ? 'frame' : null;
      if (key && data.start !== null && e.startTime >= data.start && (data.end === null || e.startTime + e.duration <= data.end)) append(key, { atMs: e.startTime, durationMs: e.duration });
    }
  };
  if (sampling) {
    observer = new PerformanceObserver(list => consume(list.getEntries()));
    observer.observe({ entryTypes: ['measure'] });
    const tick = now => {
      if (active && lastRaf !== undefined) append('raf', { atMs: now, durationMs: now - lastRaf });
      lastRaf = active ? now : undefined;
      if (!data.end) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  window.addEventListener('benchmark:warmup-start', () => window.__qualificationProtocol.start());
  window.addEventListener('benchmark:measure-start', () => { data.start = performance.now(); active = true; lastRaf = undefined; });
  const finish = completed => {
    active = false; data.end = performance.now();
    if (observer) { consume(observer.takeRecords()); observer.disconnect(); }
    data.protocol = window.__qualificationProtocol.finish(completed);
  };
  window.addEventListener('benchmark:measure-end', () => finish(true));
  window.addEventListener('benchmark:invalid', () => finish(false));
  for (const name of ['blur', 'focus', 'visibilitychange', 'pagehide', 'pageshow', 'freeze', 'resume']) {
    window.addEventListener(name, () => append('events', { name, atMs: performance.now(), hidden: document.hidden, hasFocus: document.hasFocus() }), true);
  }
  window.addEventListener('error', e => append('errors', String(e.message)));
  window.addEventListener('unhandledrejection', e => append('errors', String(e.reason)));
  window.__benchmarkCapture = data;
}
