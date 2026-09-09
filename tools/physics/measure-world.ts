// Offline observations, not vehicle qualification or a hardware performance budget.
// node --expose-gc --import tsx tools/physics/measure-world.ts <output.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { createHash } from 'node:crypto';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysicalWorld, initializeRapier } from '../../src/lib/physics/physical-world';
import { parseZoneArtifact } from '../../src/lib/zone/zone-artifact';

const catalogue = JSON.parse(readFileSync(new URL('../../public/zones/index.json', import.meta.url), 'utf8'));
const start = performance.now(); await initializeRapier();
const initializationMs = performance.now() - start;
const memory = () => { global.gc?.(); return process.memoryUsage(); };
const samples: unknown[] = [];
const measurements = [];
for (const entry of catalogue.zones) {
  const bytes = readFileSync(new URL(`../../public${entry.artifact.url}`, import.meta.url));
  const artifact = parseZoneArtifact(JSON.parse(bytes.toString()));
  const physical = createPhysicalWorld(artifact);
  const e = physical.envelope;
  let position: { x: number; y: number; z: number } | undefined;
  // Bounded test-probe search; this deliberately does not claim a vehicle/road spawn.
  const queries: number[] = [];
  for (let ix = 1; ix < 16 && !position; ix++) for (let iz = 1; iz < 16 && !position; iz++) {
    const x = e.minimumX + (e.maximumX - e.minimumX) * ix / 16;
    const z = e.minimumZ + (e.maximumZ - e.minimumZ) * iz / 16;
    const started = performance.now();
    const clear = physical.clearance({ minimumX: x - 0.25, maximumX: x + 0.25, minimumZ: z - 0.25, maximumZ: z + 0.25, minimumY: 0.1, maximumY: 3 });
    queries.push(performance.now() - started);
    if (clear.clear) position = { x, y: 2, z };
  }
  if (!position) throw new Error(`No clear test probe location in ${entry.id}`);
  const body = physical.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z).setCcdEnabled(true));
  physical.world.createCollider(RAPIER.ColliderDesc.cuboid(0.25, 0.25, 0.25), body);
  const times: number[] = [];
  for (let i = 0; i < 600; i++) {
    const started = performance.now(); physical.step(); times.push(performance.now() - started);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const finalProbeY = body.translation().y;
  if (Math.abs(finalProbeY - 0.25) > 0.01) throw new Error(`Unsupported probe in ${entry.id}`);
  const debug = physical.debugRender();
  measurements.push({
    label: entry.label, id: entry.id, sha256: createHash('sha256').update(bytes).digest('hex'), envelope: e,
    ...physical.metrics, debugPositionBytes: debug.vertices.byteLength,
    queries: { count: queries.length, maximumMs: Math.max(...queries) },
    probe: { initial: position, finalY: finalProbeY, steps: times.length, hz: 60, halfExtentMetres: 0.25 },
    stepMs: { mean: times.reduce((sum, value) => sum + value, 0) / times.length, p95: sorted[Math.floor(times.length * 0.95)], maximum: sorted.at(-1) }
  });
  physical.dispose();
}
const denseEntry = catalogue.zones.at(-1);
const dense = parseZoneArtifact(JSON.parse(readFileSync(new URL(`../../public${denseEntry.artifact.url}`, import.meta.url), 'utf8')));
samples.push({ cycle: 0, ...memory() });
for (let cycle = 1; cycle <= 20; cycle++) {
  const physical = createPhysicalWorld(dense); physical.step(); physical.dispose();
  if (cycle % 5 === 0) samples.push({ cycle, ...memory() });
}
const result = {
  checkedAt: new Date().toISOString(), runtime: process.version, rapier: RAPIER.version(),
  platform: `${platform()} ${release()}`, cpu: cpus()[0].model, initializationMs, measurements,
  repeatedDisposal: { cell: denseEntry.label, cycles: 20, gcExposed: !!global.gc, processMemoryBytes: samples },
  limitations: 'Node x86_64 observations, one small falling/sleeping probe. Not sustained driving, browser frame cost, exact live WASM allocations, phone performance or a memory-leak proof. Shared WASM linear memory retains its high-water allocation after World.free().'
};
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
else console.log(JSON.stringify(result, null, 2));
