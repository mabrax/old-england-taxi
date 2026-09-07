// Start the local preview independently of the terminal/agent session that launches it.
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../', import.meta.url));
const url = 'http://127.0.0.1:4175';
const cache = join(root, '.zone-cache');
const logPath = join(cache, 'preview.log');
async function health() {
  try {
    const response = await fetch(`${url}/api/zone-generation`, { signal: AbortSignal.timeout(1000) });
    return response.ok && (await response.json()).available === true;
  } catch { return false; }
}
if (await health()) {
  console.log(`Preview is already running: ${url}`);
} else {
  if (!existsSync(join(root, 'dist/index.html'))) throw new Error('Build the app first with npm run build.');
  mkdirSync(cache, { recursive: true });
  const log = openSync(logPath, 'a');
  const child = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], {
    cwd: root, detached: true, stdio: ['ignore', log, log]
  });
  closeSync(log);
  let failure;
  child.once('error', error => { failure = error; });
  child.unref();
  let ready = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    if (failure || child.exitCode !== null) break;
    if (await health()) { ready = true; break; }
    await delay(250);
  }
  if (!ready) {
    child.kill('SIGTERM');
    throw failure ?? new Error(`Preview did not start. See ${logPath}.`);
  }
  writeFileSync(join(cache, 'preview-process.json'), JSON.stringify({ pid: child.pid, url, logPath, startedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(`Preview running independently: ${url}\nPID: ${child.pid}\nLog: ${logPath}`);
}
