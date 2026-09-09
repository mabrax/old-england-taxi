import {beforeAll,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {boxPenetration} from '../tools/physics/box-contact';
import {contactRun,stepVehicle} from '../tools/physics/vehicle-evidence';
import {createPhysicalWorld,initializeRapier} from '../src/lib/physics/physical-world';
import {createVehicle} from '../src/lib/physics/vehicle';
import {yawPose} from '../src/lib/physics/vehicle-config';
beforeAll(initializeRapier);
describe('qualification contact oracle',()=>{
 it('detects separation and actual shallow/deep overlaps independently of narrow-phase distance',()=>{
  const a=yawPose(0,0,0),b=yawPose(0,2.1,0),half={x:1,y:1,z:1};
  expect(boxPenetration(a,half,b,half)).toBe(0);
  b.position.z=1.99;expect(boxPenetration(a,half,b,half)).toBeCloseTo(.01,8);
  b.position.z=1.8;expect(boxPenetration(a,half,b,half)).toBeCloseTo(.2,8);
  const rotated=yawPose(0,2.5,Math.PI/4);expect(boxPenetration(a,half,rotated,half)).toBe(0);
  rotated.position.z=2.4;expect(boxPenetration(a,half,rotated,half)).toBeGreaterThan(.01);
 });
 it('checks Tower Bridge near-boundary corner approaches without accepting erroneous cuboid witnesses',()=>{
  const a=JSON.parse(readFileSync('public/zones/cell-bc662dbb6af4d9776e6f0949104133900761f4c6cd0f4fdd567041c1cb06996a.zone.json','utf8'));
  for(const [offset,speed] of [[0,8],[.07,8],[-.11,8],[0,5],[0,3]]){
   const p=createPhysicalWorld(a),v=createVehicle(p,a);try{
    stepVehicle(p,v,120);const r=contactRun(p,v,-135.17673955455476,365.3727624090656+offset,-.025107156047758754,speed);
    expect(r.maximumPenetration).toBeLessThanOrEqual(.03);expect(r.maximumBoundaryOverhang).toBeLessThan(.04);
    expect(r.occupiedFrames).toBe(0);expect(r.recoveries).toBe(0);expect(r.contactFrames).toBeGreaterThan(40);
    if(offset===0&&speed===8)expect(r.maximumReportedShapePenetration).toBeGreaterThan(.14);
   }finally{v.dispose();p.dispose();}
  }
 });
});
