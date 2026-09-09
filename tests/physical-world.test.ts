import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysicalWorld, initializeRapier, type PhysicalWorld } from '../src/lib/physics/physical-world';
import { derivePlayEnvelope } from '../src/lib/physics/world-geometry';
import { parseZoneArtifact } from '../src/lib/zone/zone-artifact';
import { box, physicalFixture } from './helpers/physical-fixture';

beforeAll(initializeRapier);
const worlds: PhysicalWorld[] = [];
const make = () => { const world = createPhysicalWorld(physicalFixture()); worlds.push(world); return world; };
afterEach(() => { worlds.splice(0).forEach(world => world.dispose()); vi.restoreAllMocks(); });

describe('artifact-owned geometry and solid clearance', () => {
  it('uses only clipped-road vertices with a 1 m inset; ignores mesh/graph outliers', () => {
    const artifact = physicalFixture();
    artifact.coordinates.localBounds.minimumX = -10000;
    artifact.geometry.roads.bounds.minimumX = -20000; // derive from vertices even if this metadata changes.
    artifact.streetGraph.nodes[0].position = [50000, 0, 50000];
    expect(derivePlayEnvelope(artifact)).toEqual({ minimumX: -29, maximumX: 29, minimumZ: -29, maximumZ: 29 });
    artifact.geometry.roads.positions = [0, 0, 0, 1, 0, 1];
    expect(() => derivePlayEnvelope(artifact)).toThrow('too narrow');
  });

  it('distinguishes a courtyard from a fully enclosed box with no surface contact', () => {
    const physical = make();
    expect(physical.intersectsBuildingSurface(box(7, 0))).toBe(false);
    expect(physical.occupied(box(7, 0))).toBe(true);
    expect(physical.clearance(box(7, 0)).reasons).toEqual(['building']);
    expect(physical.clearance(box(0, 0)).clear).toBe(true);
    expect(physical.clearance(box(22, 12)).clear).toBe(true); // L-shaped concavity
    expect(physical.clearance(box(16, 12)).clear).toBe(false);
    expect(physical.clearance(box(7, 0, 0.25, 8.01, 9)).clear).toBe(true);
    expect(physical.clearance(box(7, 0, 0.25, 7.9, 9)).clear).toBe(false);
  });

  it('tests the full box, including wall crossings with every box corner outside', () => {
    const physical = make();
    expect(physical.occupied(box(0, 0, 11))).toBe(true); // contains a building ring; centre/corners all outside it.
    const crossing = { ...box(0, 0), minimumX: -12, maximumX: 12, minimumZ: -0.1, maximumZ: 0.1 };
    expect(physical.occupied(crossing)).toBe(true);
    expect(physical.clearance(box(0, 0, 3.99)).clear).toBe(true);
    expect(physical.clearance(box(0, 0, 4)).clear).toBe(false); // touching inner wall
    expect(physical.occupied(box(7, 0, 0))).toBe(true); // point containment
    expect(physical.occupied(box(0, 0, 0))).toBe(false);
  });

  it('accounts for boundary margins, ground penetration and recovery of the entire envelope', () => {
    const physical = make();
    expect(physical.clearance(box(28, -20), 0.5).clear).toBe(true);
    expect(physical.clearance(box(28, -20), 1).reasons).toEqual(['boundary']);
    expect(physical.clearance(box(0, -20, 0.25, -0.1)).reasons).toEqual(['ground']);
    expect(physical.needsRecovery(box(28.9, -20))).toBe(true);
    expect(physical.needsRecovery(box(0, -20, 0.25, -3))).toBe(true);
    expect(physical.needsRecovery(box(0, -20, 0.25, 19, 21))).toBe(true);
    expect(physical.needsRecovery(box(NaN, 0))).toBe(true);
    expect(() => physical.clearance(box(NaN, 0))).toThrow('finite');
    expect(() => physical.clearance(box(0, 0), -1)).toThrow('nonnegative');
    expect(() => physical.clearance({ ...box(0, 0), maximumX: -10 })).toThrow('ordered');
  });

  it('fails closed on an open or sloped building mesh rather than guessing occupancy', () => {
    const artifact = physicalFixture();
    artifact.geometry.buildings.indices.splice(-3);
    expect(() => createPhysicalWorld(artifact)).toThrow('closed');
    const sloped = physicalFixture();
    sloped.geometry.buildings.positions[1] += 1;
    expect(() => createPhysicalWorld(sloped)).toThrow('flat extrusion');
  });

  it('has ground + a closed building mesh + four boundary colliders, with one road support surface', () => {
    const physical = make();
    expect(physical.metrics.colliders).toBe(6);
    expect(physical.metrics.rigidBodies).toBe(0);
    expect(physical.metrics.buildingBaseTriangles).toBe(12);
    expect(physical.metrics.buildingTriangles).toBe(physicalFixture().geometry.buildings.statistics.triangles);
    const hits: number[] = [];
    physical.world.intersectionsWithRay(new RAPIER.Ray({ x: 0, y: 1, z: -20 }, { x: 0, y: -1, z: 0 }), 2, false, hit => {
      hits.push(hit.timeOfImpact); return true;
    });
    expect(hits).toEqual([1]);
  });
});

function probe(physical: PhysicalWorld, x: number, z: number, vx = 0, vz = 0, y = 0.4) {
  const body = physical.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z)
    .setLinvel(vx, 0, vz).setCcdEnabled(true).lockRotations());
  physical.world.createCollider(RAPIER.ColliderDesc.cuboid(0.25, 0.25, 0.25).setFriction(0).setRestitution(0), body);
  return body;
}

describe('focused 0.5 m cuboid probes at 60 Hz, CCD, 10 m/s per moving axis', () => {
  it.each([[0, -20], [20, -20], [0, 0]])('supports road, off-road and courtyard ground at (%i, %i)', (x, z) => {
    const physical = make(), body = probe(physical, x, z, 0, 0, 3);
    for (let i = 0; i < 240; i++) physical.step();
    expect(body.translation().y).toBeCloseTo(0.25, 2);
    expect(Math.abs(body.linvel().y)).toBeLessThan(0.01);
  });

  it.each([
    { name: 'outer west wall', x: -15, z: 0, vx: 10, vz: 0, axis: 'x', limit: -10.25, sign: 1 },
    { name: 'inner east wall', x: 0, z: 0, vx: 10, vz: 0, axis: 'x', limit: 3.75, sign: 1 },
    { name: 'inner north wall', x: 0, z: 0, vx: 0, vz: -10, axis: 'z', limit: -3.75, sign: -1 },
    { name: 'east boundary', x: 25, z: -20, vx: 10, vz: 0, axis: 'x', limit: 28.75, sign: 1 },
    { name: 'west boundary', x: -25, z: -20, vx: -10, vz: 0, axis: 'x', limit: -28.75, sign: -1 },
    { name: 'south boundary', x: -20, z: 25, vx: 0, vz: 10, axis: 'z', limit: 28.75, sign: 1 },
    { name: 'north boundary', x: -20, z: -25, vx: 0, vz: -10, axis: 'z', limit: -28.75, sign: -1 }
  ])('stops at $name', ({ x, z, vx, vz, axis, limit, sign }) => {
    const physical = make(), body = probe(physical, x, z, vx, vz);
    for (let i = 0; i < 120; i++) {
      physical.step();
      const coordinate = body.translation()[axis as 'x' | 'z'];
      expect((coordinate - limit) * sign).toBeLessThan(0.02);
    }
    expect(body.translation()[axis as 'x' | 'z']).toBeCloseTo(limit, 1);
  });

  it('blocks a diagonal corner impact and a glancing outer wall contact', () => {
    const physical = make(), corner = probe(physical, -14, -14, 10, 10);
    const glancing = probe(physical, -14, 0, 10, 2);
    for (let i = 0; i < 90; i++) {
      physical.step();
      // A corner may deflect along either face; both axes must never enter the solid together.
      expect(Math.min(corner.translation().x, corner.translation().z)).toBeLessThan(-10.23);
      expect(corner.translation().y).toBeLessThan(0.41); // No false lift from internal wall-triangle seams.
      expect(glancing.translation().x).toBeLessThan(-10.23);
    }
    expect(glancing.translation().z).toBeGreaterThan(0.5); // Tangential motion before friction stops it.
  });

  it('keeps diagonal corner penetration below 2 cm across approach speeds and timestep offsets', () => {
    for (const speed of [3, 5, 10]) for (const start of [-14, -14.1, -14.2, -14.3]) {
      const physical = make(), body = probe(physical, start, start, speed, speed);
      for (let i = 0; i < 180; i++) {
        physical.step();
        expect(Math.min(body.translation().x, body.translation().z)).toBeLessThan(-10.23);
      }
      physical.dispose();
    }
  });
});

describe('real corpus and ownership', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../public/zones/index.json', import.meta.url), 'utf8'));
  it.each(catalogue.zones as { id: string; label: string }[])('constructs and queries $label without reports or source QA', ({ id }) => {
    const artifact = parseZoneArtifact(JSON.parse(readFileSync(new URL(`../public/zones/${id}.zone.json`, import.meta.url), 'utf8')));
    const before = JSON.stringify(artifact);
    const physical = createPhysicalWorld(artifact); worlds.push(physical);
    expect(physical.metrics.colliders).toBe(6);
    for (let i = 0; i < 10; i++) physical.step();
    expect(JSON.stringify(artifact)).toBe(before);
    expect(physical.metrics.roofTriangles).toBeGreaterThan(0);
    expect(physical.envelope.minimumX).toBeGreaterThan(artifact.geometry.roads.bounds.minimumX);
  });

  it('frees partially constructed and repeatedly disposed worlds exactly once', () => {
    const free = vi.spyOn(RAPIER.World.prototype, 'free');
    const create = vi.spyOn(RAPIER.World.prototype, 'createCollider').mockImplementationOnce(() => { throw new Error('injected collider failure'); });
    expect(() => createPhysicalWorld(physicalFixture())).toThrow('injected');
    expect(free).toHaveBeenCalledTimes(1);
    create.mockRestore();
    for (let i = 0; i < 10; i++) {
      const physical = make(); physical.dispose(); physical.dispose();
      expect(() => physical.step()).toThrow('disposed');
      expect(() => physical.clearance(box(0, 0))).toThrow('disposed');
    }
    expect(free).toHaveBeenCalledTimes(11);
  });
});
