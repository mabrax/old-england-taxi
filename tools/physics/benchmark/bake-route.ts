/** Offline-only fixture baker. Uses checked-in meshes and real vehicle physics. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createPhysicalWorld, initializeRapier } from '../../../src/lib/physics/physical-world';
import { createVehicle } from '../../../src/lib/physics/vehicle';
import { createSpawnSearch, vehicleBounds, pavementRectangle } from '../../../src/lib/physics/vehicle-spawn';
import { VEHICLE, NEUTRAL, rotate, yawPose } from '../../../src/lib/physics/vehicle-config';
import type { ZoneArtifact } from '../../../src/lib/zone/types';

const output = process.argv[2] ?? 'public/benchmarks/chicago-loop-v1.json';
const catalogue = JSON.parse(readFileSync('public/zones/index.json', 'utf8'));
const zone = catalogue.zones.find((z: { label: string }) => z.label === 'Chicago River North grid');
const bytes = readFileSync(`public/zones/${zone.id}.zone.json`);
const artifact = JSON.parse(bytes.toString()) as ZoneArtifact;
const nodes = new Map(artifact.streetGraph.nodes.map(n => [n.id, n.position]));
const base = artifact.streetGraph.edges.find(e => e.id === '1330337192:1')!;
const edges = artifact.streetGraph.edges.filter(e => e !== base && e.widthMetres >= 5.5);
// The fixture has a declared source edge; search is bounded by this offline graph.
const queue = [[base.to]], seen = new Set([base.to]);
let cycle: number[] | undefined;
while (queue.length) {
  const path = queue.shift()!, id = path.at(-1)!;
  if (id === base.from) { cycle = path; break; }
  for (const edge of edges) {
    const next = edge.from === id ? edge.to : edge.to === id ? edge.from : undefined;
    if (next === undefined || seen.has(next)) continue;
    seen.add(next); queue.push([...path, next]);
  }
}
assert(cycle, 'No road loop through the selected edge');
const a = nodes.get(base.from)!, b = nodes.get(base.to)!;
const start = yawPose((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, Math.atan2(b[0] - a[0], b[2] - a[2]));
const route = [[start.position.x, start.position.z], ...cycle.map(id => [nodes.get(id)![0], nodes.get(id)![2]]), [start.position.x, start.position.z]];
const segments = route.slice(1).map((b, i) => ({ a: route[i], b, length: Math.hypot(b[0] - route[i][0], b[1] - route[i][1]), start: 0 }));
let length = 0; for (const s of segments) { s.start = length; length += s.length; }
const pointAt = (at: number) => {
  at = ((at % length) + length) % length;
  const s = segments.find(s => at <= s.start + s.length)!;
  const t = (at - s.start) / s.length;
  return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
};
await initializeRapier();
const world = createPhysicalWorld(artifact), vehicle = createVehicle(world, artifact, start);
const search = createSpawnSearch(artifact, world);
const warmupSteps = 300, measuredSteps = 7200, commands: number[][] = [], checkpoints: object[] = [];
let progress = 0, distance = 0, previous = start.position, pavedSteps = 0, minimumWheelContacts = 4;
const round = (n: number) => Math.round(n * 10000) / 10000;
try {
  for (let tick = 0; tick < warmupSteps + measuredSteps; tick++) {
    const pose = vehicle.frames.current!, forward = rotate({ x: 0, y: 0, z: 1 }, pose.rotation);
    let command = { ...NEUTRAL };
    if (tick >= warmupSteps) {
      // Project locally along the loop, never jump to a distant crossing.
      let best = Infinity, next = progress;
      for (let at = progress; at <= progress + 12; at += .1) {
        const p = pointAt(at), d = Math.hypot(p[0] - pose.position.x, p[1] - pose.position.z);
        if (d < best) { best = d; next = at; }
      }
      progress = next;
      const target = pointAt(progress + 6), dx = target[0] - pose.position.x, dz = target[1] - pose.position.z;
      const lateral = dx * forward.z - dz * forward.x;
      const steering = Math.max(-1, Math.min(1, Math.atan2(2 * VEHICLE.wheelZ * 2 * lateral, dx * dx + dz * dz) / VEHICLE.steeringLimit));
      const targetSpeed = 3.6 - .9 * Math.abs(steering);
      command = { throttle: round(Math.max(0, Math.min(1, .15 + .6 * (targetSpeed - vehicle.speed)))), steering: round(steering), brake: vehicle.speed > targetSpeed + .3 ? .1 : 0 };
      commands.push([command.throttle, command.steering, command.brake]);
    }
    assert(vehicle.submit(command), `Command rejected at ${tick}`);
    vehicle.beforeStep(); world.step(); vehicle.afterStep();
    const current = vehicle.frames.current!;
    const bounds = vehicleBounds(current, .05); bounds.minimumY = 0;
    const clearance = world.clearance(bounds, .5);
    assert(clearance.clear, `Route clearance failed at tick ${tick}: ${clearance.reasons}; ${JSON.stringify(current.position)}`);
    assert.equal(vehicle.state.recoveries, 0);
    const wheels = [0, 1, 2, 3].filter(i => vehicle.controller!.wheelIsInContact(i)).length;
    if (tick >= warmupSteps) {
      minimumWheelContacts = Math.min(minimumWheelContacts, wheels);
      distance += Math.hypot(current.position.x - previous.x, current.position.z - previous.z);
      if (search.pavement.covers(pavementRectangle(current))) pavedSteps++;
      assert(wheels >= 3, `Lost support at ${tick}`);
    }
    previous = current.position;
    if ((tick + 1) % 60 === 0) checkpoints.push({ step: tick + 1, position: current.position, rotation: current.rotation, speed: vehicle.speed });
  }
  assert(progress > 200 && distance > 200, 'Workload must drive a substantial route');
  const fixture = {
    version: 1, id: 'chicago-loop-v1', artifact: { id: zone.id, sha256: createHash('sha256').update(bytes).digest('hex') },
    startKind: 'offline mesh-validated benchmark fixture; not the generic interactive spawn', startPose: start,
    stepMs: 1000 / 60, maxCatchUpSteps: 5, warmupSteps, measuredSteps, viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    vehicle: VEHICLE, route: { sourceEdge: base.id, nodeIds: cycle, points: route, lengthMetres: length },
    commands, checkpoints, tolerances: { positionMetres: .3, rotationRadians: .05, speedMetresPerSecond: .05 },
    validation: { stepsChecked: warmupSteps + measuredSteps, clearanceMarginMetres: .05, boundaryMarginMetres: .5, minimumWheelContacts, pavedSteps, distanceMetres: distance, routeProgressMetres: progress, recoveries: 0 },
  };
  const serialized = JSON.stringify(fixture) + '\n';
  mkdirSync(output.substring(0, output.lastIndexOf('/')) || '.', { recursive: true });
  writeFileSync(output, serialized);
  console.log(JSON.stringify({ output, bytes: serialized.length, sha256: createHash('sha256').update(serialized).digest('hex'), validation: fixture.validation, routeLength: length }));
} finally { vehicle.dispose(); world.dispose(); }
