import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZoneRequest, type GenerationRequest, type ZoneRequest } from '../zone-compiler/src/generation-request';
import { isFinished, type GenerationJob, type GenerationState } from '../../src/lib/zone/generation-types';

export type Runner = (request: ZoneRequest, workdir: string, progress: (state: GenerationState, message: string) => void, signal: AbortSignal) => Promise<NonNullable<GenerationJob['result']>>;
export class GenerationQueue {
  private jobs = new Map<string, GenerationJob>();
  private requests = new Map<string, ZoneRequest>();
  private waiting: string[] = [];
  private active: { id: string; abort: AbortController } | undefined;
  private running: Promise<void> | undefined;
  private closed = false;
  constructor(private root: string, private runner: Runner = workerRunner(root), private timeoutMs = 150_000) {}

  submit(input: GenerationRequest): GenerationJob {
    if (this.closed) throw new Error('Generation service is stopping');
    const request = createZoneRequest(input);
    const duplicate = [...this.jobs.values()].find(job => job.zoneId === request.id && !isFinished(job.state));
    if (duplicate) return structuredClone(duplicate);
    if (this.waiting.length + Number(!!this.active) >= 5) throw new Error('Generation queue is full. Try again when a zone finishes.');
    const job: GenerationJob = { jobId: randomUUID(), zoneId: request.id, label: request.label,
      state: 'queued', message: 'Waiting for the generation worker…', createdAt: Date.now(), updatedAt: Date.now() };
    this.jobs.set(job.jobId, job);
    this.requests.set(job.jobId, request);
    this.waiting.push(job.jobId);
    for (const old of this.jobs.values()) {
      if (this.jobs.size <= 50) break;
      if (isFinished(old.state)) { this.jobs.delete(old.jobId); this.requests.delete(old.jobId); }
    }
    this.pump();
    return structuredClone(job);
  }
  get(id: string) { const job = this.jobs.get(id); return job ? structuredClone(job) : undefined; }
  cancel(id: string) {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (!isFinished(job.state)) {
      this.waiting = this.waiting.filter(value => value !== id);
      this.update(job, 'cancelled', 'Generation cancelled. You can choose another location.');
      if (this.active?.id === id) this.active.abort.abort();
    }
    return structuredClone(job);
  }
  async close() {
    this.closed = true;
    for (const job of this.jobs.values()) this.cancel(job.jobId);
    await this.running;
  }
  private update(job: GenerationJob, state: GenerationState, message: string) {
    job.state = state; job.message = message; job.updatedAt = Date.now();
    console.info(JSON.stringify({ event: 'zone-generation', jobId: job.jobId, zoneId: job.zoneId,
      state, elapsedMs: job.updatedAt - job.createdAt, ...(state === 'failed' ? { error: message } : {}) }));
  }
  private pump() {
    if (this.active || this.closed) return;
    const id = this.waiting.shift();
    if (!id) return;
    const abort = new AbortController();
    this.active = { id, abort };
    this.running = this.execute(id, abort).finally(() => { this.active = undefined; this.pump(); });
  }
  private async execute(id: string, abort: AbortController) {
    const job = this.jobs.get(id)!;
    let workdir: string | undefined;
    const timer = setTimeout(() => abort.abort(new Error('Generation exceeded its 150-second deadline. Try a smaller cell.')), this.timeoutMs);
    try {
      await mkdir(this.root, { recursive: true });
      workdir = await mkdtemp(join(this.root, 'work-'));
      abort.signal.throwIfAborted();
      const result = await this.runner(this.requests.get(id)!, workdir, (state, message) => {
        if (!isFinished(job.state)) this.update(job, state, message);
      }, abort.signal);
      if (!isFinished(job.state)) {
        job.result = result;
        this.update(job, 'ready', result.cached ? 'Existing zone verified and ready.' : 'Your new zone is ready.');
      }
    } catch (error) {
      if (!isFinished(job.state)) {
        const reason = abort.signal.aborted ? abort.signal.reason : error;
        this.update(job, 'failed', reason instanceof Error ? reason.message : 'Zone generation failed. Try another location or a smaller cell.');
      }
    } finally {
      clearTimeout(timer);
      if (workdir) await rm(workdir, { recursive: true, force: true });
    }
  }
}

function workerRunner(cacheRoot: string): Runner {
  return (request, workdir, progress, signal) => new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(new URL('./worker.ts', import.meta.url)), [], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      execArgv: ['--max-old-space-size=1024', '--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    });
    let result: GenerationJob['result'];
    let failure: Error | undefined;
    let stderr = '';
    child.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-1500); });
    const cancel = () => child.kill('SIGKILL');
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    child.on('message', (message: { state?: GenerationState; message?: string; error?: string; result?: GenerationJob['result'] }) => {
      if (message.state && message.message) progress(message.state, message.message);
      if (message.error) failure = new Error(message.error);
      if (message.result) result = message.result;
    });
    child.once('error', error => { failure = error; });
    child.once('close', code => {
      signal.removeEventListener('abort', cancel);
      if (signal.aborted) reject(signal.reason);
      else if (failure) reject(failure);
      else if (code !== 0 || !result) reject(new Error(`Generation worker stopped before finishing${stderr.includes('heap') ? ' (memory limit reached; try a smaller cell)' : ''}.`));
      else resolve(result);
    });
    if (!signal.aborted) child.send({ request, workdir, cacheRoot }, error => { if (error) failure = error; });
  });
}
