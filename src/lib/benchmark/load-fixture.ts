import { validateFixture, type BenchmarkFixture } from './replay';

export const BENCHMARK = Object.freeze({
  id: 'chicago-loop-v1', sha256: '39cf65e554fccd7bdcc9fa721a4e020fe61025e7cc68926163b92a84511ea79b'
});
export async function loadBenchmarkFixture(search: string, artifact: { id: string; sha256: string }, signal: AbortSignal) {
  const params = new URLSearchParams(search), id = params.get('benchmark');
  if (id !== BENCHMARK.id || params.has('artifact') || params.has('qa') || params.has('vehicle')) throw new Error('Use the supported benchmark with its prepared zone and QA disabled');
  const response = await fetch(`${import.meta.env.BASE_URL}benchmarks/${BENCHMARK.id}.json`, { signal });
  if (!response.ok) throw new Error('Benchmark fixture could not be loaded');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 1_000_000) throw new Error('Benchmark fixture exceeds capture bounds');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
  if (hash !== BENCHMARK.sha256) throw new Error('Benchmark fixture hash mismatch');
  const fixture = JSON.parse(new TextDecoder().decode(bytes)) as BenchmarkFixture;
  validateFixture(fixture);
  if (fixture.id !== id || fixture.artifact.id !== artifact.id || fixture.artifact.sha256 !== artifact.sha256) throw new Error('Benchmark map identity mismatch');
  return fixture;
}
