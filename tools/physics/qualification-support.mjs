import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// External timer: it still expires when the renderer stops delivering RAF/timers.
export async function bounded(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label)), ms); })]); }
  finally { clearTimeout(timer); }
}

export function memoryAcceptance(cycles) {
  const heaps = cycles.map(c => c.heap?.used);
  if (cycles.length !== 20 || heaps.some(h => !Number.isFinite(h) || h <= 0)) return { result: 'unmeasured', reason: 'Requires 20 reliable post-GC JS heap samples' };
  const growth = heaps[19] - heaps[4], allowedGrowth = Math.max(20 * 1024 ** 2, heaps[4] * .1);
  return { postGcHeap: heaps.every(h => h <= 256 * 1024 ** 2), growth, allowedGrowth, growthPass: growth <= allowedGrowth, scope: 'JS heap only; excludes native/WASM/GPU allocations' };
}

// Supplementary Linux measurements, outside timed driving. No new acceptance
// threshold: PSS and driver GPU allocations overlap and MUST NOT be added.
export function processMemory(rootPid) {
  if (process.platform !== 'linux') return { pssBytes: null, gpu: { bytes: null }, reason: 'Supplementary process-memory method is Linux/NVIDIA-only; use a separately agreed method on this OS.' };
  const startedAt = new Date().toISOString(), parents = new Map(), errors = [];
  for (const name of readdirSync('/proc').filter(n => /^\d+$/.test(n))) {
    try {
      const status = readFileSync(`/proc/${name}/status`, 'utf8');
      parents.set(Number(name), Number(status.match(/^PPid:\s+(\d+)/m)?.[1]));
    } catch { /* unrelated processes may exit during enumeration */ }
  }
  const ids = new Set([rootPid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const [pid, parent] of parents) if (ids.has(parent) && !ids.has(pid)) { ids.add(pid); changed = true; }
  }
  const processes = [...ids].map(pid => {
    try {
      const data = readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8');
      const fields = Object.fromEntries([...data.matchAll(/^(Rss|Pss|Private_Clean|Private_Dirty|SwapPss):\s+(\d+) kB/gm)].map(m => [m[1], Number(m[2]) * 1024]));
      if (!Number.isFinite(fields.Pss)) throw Error('Pss missing');
      const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      return { pid, role: command.match(/--type=([^\0]+)/)?.[1] ?? 'browser', ...fields };
    } catch (error) { errors.push({ pid, error: String(error) }); return { pid, unmeasured: true }; }
  });
  let gpu;
  try {
    const xml = execFileSync('nvidia-smi', ['-q', '-x'], { encoding: 'utf8', timeout: 5000 });
    const matching = [...xml.matchAll(/<process_info>([\s\S]*?)<\/process_info>/g)].map(m => {
      const pid = Number(m[1].match(/<pid>(\d+)<\/pid>/)?.[1]);
      const raw = m[1].match(/<used_memory>([^<]+)<\/used_memory>/)?.[1];
      return { pid, raw, bytes: /^\d+ MiB$/.test(raw ?? '') ? Number(raw.split(' ')[0]) * 1024 ** 2 : null };
    }).filter(p => ids.has(p.pid));
    gpu = { processes: matching, bytes: matching.length && matching.every(p => p.bytes !== null) ? matching.reduce((a, p) => a + p.bytes, 0) : null };
  } catch (error) { gpu = { bytes: null, error: String(error) }; }
  return { startedAt, endedAt: new Date().toISOString(), rootPid, processes, errors,
    pssBytes: errors.length ? null : processes.reduce((a, p) => a + p.Pss, 0), gpu,
    scope: 'Fresh browser process tree; PSS includes resident JS/WASM/native/shared mappings. NVIDIA driver process allocations reported separately. Non-atomic samples; no combined total or acceptance threshold.' };
}

// Retry only an incomplete process snapshot, never a large measured value.
// Keep every failed read; choose the first complete observation, not the lowest.
export function stableProcessMemory(rootPid, collect = processMemory) {
  const attempts = [];
  for (let index = 0; index < 3; index++) {
    const sample = collect(rootPid); attempts.push(sample);
    if (Number.isFinite(sample.pssBytes) || sample.reason) return { ...sample, attempts };
  }
  return { ...attempts.at(-1), attempts };
}
