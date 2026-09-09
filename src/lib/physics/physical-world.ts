import RAPIER from '@dimforge/rapier3d-compat';
import type { ZoneArtifact, ZoneBounds3d } from '../zone/types';
import type { Vec3 } from './vehicle-config';
import { BOUNDARY_HEIGHT_METRES, containsBox, derivePlayEnvelope, indexBuildingGeometry, needsRecovery, validBox } from './world-geometry';

export const FIXED_STEP_SECONDS = 1 / 60;
let initialization: Promise<void> | undefined;
/** The WASM module is page-owned; failed initialization may be retried by a new scene. */
export function initializeRapier(): Promise<void> {
  return initialization ??= RAPIER.init().catch(error => { initialization = undefined; throw error; });
}

export interface WorldMetrics {
  setupMs: number;
  colliders: number;
  rigidBodies: number;
  buildingTriangles: number;
  buildingBaseTriangles: number;
  roofTriangles: number;
  geometryBytes: number;
}

/** Construct only after initializeRapier resolves. The caller owns disposal. */
export function createPhysicalWorld(artifact: ZoneArtifact) {
  const start = performance.now();
  const envelope = derivePlayEnvelope(artifact);
  const geometry = indexBuildingGeometry(artifact.geometry.buildings);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  let disposed = false;
  try {
    world.timestep = FIXED_STEP_SECONDS;
    // Eight CCD substeps support the probe and 8 m/s rotating-chassis contact checks at 60 Hz.
    world.integrationParameters.maxCcdSubsteps = 8;
    const cx = (envelope.minimumX + envelope.maximumX) / 2;
    const cz = (envelope.minimumZ + envelope.maximumZ) / 2;
    const hx = (envelope.maximumX - envelope.minimumX) / 2;
    const hz = (envelope.maximumZ - envelope.minimumZ) / 2;
    const fixed = (x: number, y: number, z: number, px: number, py: number, pz: number) =>
      world.createCollider(RAPIER.ColliderDesc.cuboid(x, y, z).setTranslation(px, py, pz).setFriction(0.8).setRestitution(0));
    fixed(hx + 1, 0.5, hz + 1, cx, -0.5, cz);
    const building = world.createCollider(RAPIER.ColliderDesc.trimesh(geometry.positions, geometry.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
      .setFriction(0.8).setRestitution(0));
    const wallHalfHeight = (BOUNDARY_HEIGHT_METRES + 1) / 2;
    const wallCenterY = wallHalfHeight - 1;
    fixed(0.5, wallHalfHeight, hz + 1, envelope.minimumX - 0.5, wallCenterY, cz);
    fixed(0.5, wallHalfHeight, hz + 1, envelope.maximumX + 0.5, wallCenterY, cz);
    fixed(hx + 1, wallHalfHeight, 0.5, cx, wallCenterY, envelope.minimumZ - 0.5);
    fixed(hx + 1, wallHalfHeight, 0.5, cx, wallCenterY, envelope.maximumZ + 0.5);
    // Populate Rapier's query structures before publishing a paused, queryable world.
    world.step();
    const metrics: WorldMetrics = Object.freeze({
      setupMs: performance.now() - start, colliders: world.colliders.len(), rigidBodies: world.bodies.len(),
      buildingTriangles: geometry.indices.length / 3, buildingBaseTriangles: geometry.floorTriangles,
      roofTriangles: geometry.roofTriangles.length / 7,
      geometryBytes: geometry.positions.byteLength + geometry.indices.byteLength + geometry.roofTriangles.byteLength
    });
    const assertLive = () => { if (disposed) throw new Error('Physical world is disposed.'); };
    return {
      envelope, metrics,
      // The session may add its chassis/controller within this world's lifetime.
      world,
      step() { assertLive(); world.step(); },
      debugRender() { assertLive(); return world.debugRender(RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC); },
      /** Camera volume query: static walls/buildings/ground only; never move the simulation. */
      cameraSweep(from: Vec3, to: Vec3, radius: number) {
        assertLive();
        const velocity = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
        const length = Math.hypot(velocity.x, velocity.y, velocity.z);
        if (length < 1e-6) return 1;
        const hit = world.castShape(from, { x: 0, y: 0, z: 0, w: 1 }, velocity,
          new RAPIER.Ball(radius), 0, 1, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
        return hit ? Math.max(0, hit.time_of_impact - 0.05 / length) : 1;
      },
      occupied(box: ZoneBounds3d) { assertLive(); return geometry.occupied(box); },
      clearance(box: ZoneBounds3d, boundaryMargin = 0) {
        assertLive();
        if (!validBox(box) || !Number.isFinite(boundaryMargin) || boundaryMargin < 0) {
          throw new Error('Clearance requires a finite ordered world box and nonnegative boundary margin.');
        }
        const reasons: ('boundary' | 'ground' | 'building')[] = [];
        if (!containsBox(envelope, box, boundaryMargin) || box.maximumY > BOUNDARY_HEIGHT_METRES) reasons.push('boundary');
        if (box.minimumY < 0) reasons.push('ground');
        if (geometry.occupied(box)) reasons.push('building');
        return { clear: reasons.length === 0, reasons };
      },
      needsRecovery(box: ZoneBounds3d) { assertLive(); return needsRecovery(envelope, box); },
      /** Surface-only diagnostic to demonstrate why solid occupancy is also required. */
      intersectsBuildingSurface(box: ZoneBounds3d) {
        assertLive();
        if (!validBox(box)) throw new Error('Surface query requires a finite ordered world box.');
        return building.intersectsShape(new RAPIER.Cuboid(
          (box.maximumX - box.minimumX) / 2, (box.maximumY - box.minimumY) / 2, (box.maximumZ - box.minimumZ) / 2
        ), { x: (box.minimumX + box.maximumX) / 2, y: (box.minimumY + box.maximumY) / 2, z: (box.minimumZ + box.maximumZ) / 2 },
        { x: 0, y: 0, z: 0, w: 1 });
      },
      dispose() { if (disposed) return; disposed = true; world.free(); }
    };
  } catch (error) {
    world.free();
    throw error;
  }
}

export type PhysicalWorld = ReturnType<typeof createPhysicalWorld>;
