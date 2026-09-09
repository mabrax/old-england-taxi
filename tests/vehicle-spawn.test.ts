import { beforeAll, describe, expect, it } from 'vitest';
import { createPhysicalWorld, initializeRapier } from '../src/lib/physics/physical-world';
import { createSpawnSearch, indexPavement, pavementRectangle, vehicleBounds } from '../src/lib/physics/vehicle-spawn';
import { VEHICLE, yawPose } from '../src/lib/physics/vehicle-config';
import { vehicleFixture } from './helpers/vehicle-fixture';
beforeAll(initializeRapier);
describe('whole-vehicle safe start', () => {
  it('is bounded and repeatable; actual pavement and clearance override graph metadata', () => {
    const a = vehicleFixture(), p = createPhysicalWorld(a);
    try {
      const s = createSpawnSearch(a,p), first = s.find(); expect(first.pose).toBeDefined(); expect(s.find()).toEqual(first);
      expect(s.validate(yawPose(0,0,0)).reasons).toContain('building');
      expect(s.validate(yawPose(97,-40,0)).reasons).toContain('boundary');
      expect(s.validate(yawPose(30,30,0)).reasons).toContain('pavement');
      expect(s.validate(yawPose(NaN,0,0)).reasons).toContain('invalid pose');
      // Building is missed by a centre-only query; the complete launch corridor crosses its wall.
      expect(p.occupied({minimumX:12,maximumX:12,minimumZ:0,maximumZ:0,minimumY:0,maximumY:1})).toBe(false);
      expect(s.validate(yawPose(12,0,-Math.PI/2)).reasons).toContain('building');
      // Misleading width, length and out-of-bound endpoint hints never authorize a start.
      a.streetGraph.nodes[0].position=[200,0,0]; a.streetGraph.nodes[1].position=[300,0,0];
      a.streetGraph.edges=Array.from({length:400},(_,i)=>({...a.streetGraph.edges[0],id:String(i),widthMetres:1000}));
      const rejected=createSpawnSearch(a,p).find();expect(rejected.pose).toBeUndefined();expect(rejected.attempts).toBe(VEHICLE.maximumCandidates);
    } finally { p.dispose(); }
  });
  it('rejects narrow pavement even when all wheel ray centres could fit, and accepts rotated coverage', () => {
    const a=vehicleFixture(), p=createPhysicalWorld(a);
    try {
      a.geometry.roads.indices=[0,2,1,0,3,2];
      a.geometry.roads.positions=[-100,0,-40.9,100,0,-40.9,100,0,-39.1,-100,0,-39.1];
      expect(createSpawnSearch(a,p).find().pose).toBeUndefined();
      const road=indexPavement(vehicleFixture().geometry.roads);
      expect(road.covers(pavementRectangle(yawPose(0,-40,Math.PI/4)))).toBe(true);
      const b=vehicleBounds(yawPose(0,-40,Math.PI/4));expect(b.maximumX-b.minimumX).toBeGreaterThan(4.5);
      expect(b.minimumY).toBeCloseTo(0);
    } finally {p.dispose();}
  });
  it('detects a small interior pavement hole and overlapping triangles cannot hide it', () => {
    const mesh=vehicleFixture().geometry.roads;
    // Rectangle split around a small hole that avoids the centre, wheel centres and corners.
    const positions:number[]=[],indices:number[]=[];
    for(const [x0,z0,x1,z1] of [[-10,-10,10,-0.7],[-10,-0.5,10,10],[-10,-0.7,0.4,-0.5],[0.6,-0.7,10,-0.5]]){
      const n=positions.length/3;positions.push(x0,0,z0,x1,0,z0,x1,0,z1,x0,0,z1);indices.push(n,n+2,n+1,n,n+3,n+2);
    }
    const road=indexPavement({...mesh,positions,indices:[...indices,...indices]});
    expect(road.covers(pavementRectangle(yawPose(0,0,0)))).toBe(false);
    expect(road.covers(pavementRectangle(yawPose(4,0,0)))).toBe(true);
  });
  it('rejects headroom overlap using the entire upper envelope, while allowing open courtyard geometry', () => {
    const a=vehicleFixture(),p=createPhysicalWorld(a);
    try {
      expect(p.occupied(vehicleBounds(yawPose(0,0,0)))).toBe(false);
      expect(p.occupied(vehicleBounds(yawPose(5,0,0)))).toBe(true);
      const pose=yawPose(5,0,0);pose.position.y=8.9;
      expect(p.occupied(vehicleBounds(pose))).toBe(true);
      pose.position.y=9.1;expect(p.occupied(vehicleBounds(pose))).toBe(false);
    }finally{p.dispose();}
  });
});
