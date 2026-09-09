/** Browser-injected observer for qualification only; no application/physics handles. */
export function installQualificationProtocol() {
  const limit = 10000;
  const report = {
    version: 1, clock: 'page performance.now milliseconds', phase: 'idle',
    startedAt: null, endedAt: null, complete: false,
    intervals: [], checkpoints: [], violations: [], droppedRecords: 0,
    timingScope: 'Observed state intervals; mutation times are delivery times, not exact onset times.'
  };
  let current;
  const read = () => {
    const d = document.querySelector('canvas')?.dataset;
    return {
      mode: d?.drivingMode ?? null, physics: d?.physicsStatus ?? null,
      vehicle: d?.vehicleStatus ?? null, steps: Number(d?.physicsSteps ?? 0),
      hidden: document.hidden, hasFocus: document.hasFocus()
    };
  };
  const append = (key, value) => {
    if (report[key].length < limit) report[key].push(value);
    else report.droppedRecords++;
  };
  const reasons = state => {
    const result = [];
    if (state.hidden) result.push('page hidden');
    if (!state.hasFocus) result.push('window lacks focus');
    if (state.vehicle !== 'ready') result.push('vehicle not ready');
    if (report.phase === 'drive') {
      if (state.mode !== 'driving') result.push('unexpected non-driving mode');
      if (state.physics !== 'running') result.push('unexpected non-running physics');
    } else {
      if (!['driving', 'paused'].includes(state.mode)) result.push('invalid reset mode');
      if (!['running', 'paused'].includes(state.physics)) result.push('invalid reset physics');
    }
    return result;
  };
  const sample = (source, state = read()) => {
    if (!['drive', 'reset'].includes(report.phase)) return state;
    const at = performance.now(), invalid = reasons(state);
    const signature = JSON.stringify([report.phase, state.mode, state.physics, state.vehicle, state.hidden, state.hasFocus]);
    if (current) {
      current.endMs = at;
      if (current.signature === signature) current.endState = state;
    }
    if (!current || current.signature !== signature) {
      current = { signature, phase: report.phase, startMs: at, endMs: at, startState: state, endState: state, source, invalid };
      append('intervals', current);
      if (invalid.length) append('violations', { atMs: at, source, phase: report.phase, state, reasons: invalid });
    }
    return state;
  };
  const attributes = { 'data-driving-mode': 'mode', 'data-physics-status': 'physics', 'data-vehicle-status': 'vehicle' };
  // Reconstruct intermediate values in a mutation batch. A pause followed by a
  // resume in one task must not disappear just because the final DOM is driving.
  const consume = records => {
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record.target !== document.querySelector('canvas')) continue;
      const key = attributes[record.attributeName];
      if (!key) continue;
      const later = records.slice(i + 1).find(r => r.target === record.target && r.attributeName === record.attributeName);
      const value = later ? later.oldValue : record.target.getAttribute(record.attributeName);
      sample(`mutation:${record.attributeName}`, { ...read(), [key]: value });
    }
  };
  const observer = new MutationObserver(consume);
  observer.observe(document, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: Object.keys(attributes) });
  const drain = () => consume(observer.takeRecords());
  const ensure = () => {
    if (report.violations.length || report.droppedRecords) throw Error('Foreground-driving protocol invalid; retained violations cannot be cleared by reset');
  };
  const checkpoint = label => {
    drain();
    const state = sample(`checkpoint:${label}`);
    append('checkpoints', { label, atMs: performance.now(), phase: report.phase, state });
    ensure();
    return state;
  };
  const visibility = () => sample('visibilitychange');
  const blur = event => { if (event.target === window) sample('window blur', { ...read(), hasFocus: false }); };
  const focus = () => sample('window focus');
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('blur', blur);
  window.addEventListener('focus', focus);
  // This also observes state when RAF delivery stalls. Hidden/focus events and
  // mutations latch violations even if a subsequent sample has recovered.
  const timer = setInterval(() => { drain(); sample('watchdog'); }, 100);
  const api = {
    get phase() { return report.phase; },
    start() {
      if (report.phase !== 'idle') throw Error('Qualification protocol already started');
      drain(); report.startedAt = performance.now(); report.phase = 'drive';
      checkpoint('start');
    },
    checkpoint,
    beginReset(cycle) {
      if (report.phase !== 'drive') throw Error('Reset transition must begin during driving');
      // Drain/check BEFORE marking the deliberate transition: never excuse a
      // pause already observed at the end of a maneuver (the Trafalgar case).
      checkpoint(`before reset ${cycle}`);
      report.phase = 'reset'; sample(`begin reset ${cycle}`);
    },
    endReset(cycle) {
      if (report.phase !== 'reset') throw Error('No deliberate reset transition');
      drain(); sample(`end reset ${cycle}`); ensure();
      report.phase = 'drive'; checkpoint(`resumed ${cycle}`);
    },
    noProgress(label) {
      append('violations', { atMs: performance.now(), source: label, phase: report.phase, state: read(), reasons: ['physics steps did not advance during command'] });
      ensure();
    },
    finish(completed) {
      drain(); sample('finish');
      report.complete = completed && report.phase === 'drive';
      report.endedAt = performance.now();
      if (current) current.endMs = report.endedAt;
      report.phase = 'finished';
      observer.disconnect(); clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', blur); window.removeEventListener('focus', focus);
      return api.snapshot();
    },
    snapshot() {
      const intervals = report.intervals.map(({ signature, ...interval }) => ({ ...interval }));
      const totals = { driveMs: 0, resetMs: 0, unexpectedMs: 0 };
      for (const interval of intervals) {
        const duration = interval.endMs - interval.startMs;
        totals[interval.invalid.length ? 'unexpectedMs' : interval.phase === 'drive' ? 'driveMs' : 'resetMs'] += duration;
      }
      return { ...report, intervals, totals, accepted: report.complete && !report.violations.length && !report.droppedRecords && totals.driveMs > 0 };
    }
  };
  window.__qualificationProtocol = api;
}
