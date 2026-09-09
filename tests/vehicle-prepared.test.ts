import {readFileSync} from 'node:fs';
import {beforeAll,describe,expect,it} from 'vitest';
import {createPhysicalWorld,initializeRapier} from '../src/lib/physics/physical-world';
import {createVehicle} from '../src/lib/physics/vehicle';
import {createSpawnSearch} from '../src/lib/physics/vehicle-spawn';
import {VEHICLE,NEUTRAL} from '../src/lib/physics/vehicle-config';
import {stepVehicle,contactRun,preparedWalls,motionRun} from '../tools/physics/vehicle-evidence';
import type {ZoneArtifact} from '../src/lib/zone/types';
const catalogue=JSON.parse(readFileSync('public/zones/index.json','utf8')) as {zones:{id:string;label:string}[]};
beforeAll(initializeRapier);
describe('prepared bytes use the same vehicle and spawn rules',()=>{
 it.each(catalogue.zones)('$label starts deterministically, drives, brakes, reverses and resets',zone=>{
  const a=JSON.parse(readFileSync(`public/zones/${zone.id}.zone.json`,'utf8')) as ZoneArtifact,p=createPhysicalWorld(a);
  const staticDebug=p.debugRender().vertices.slice(),v=createVehicle(p,a);
  try{
   expect(v.state.status).toBe('ready');expect(v.start).toEqual(createSpawnSearch(a,p).find());expect(p.debugRender().vertices).toEqual(staticDebug);
   stepVehicle(p,v,120);const r=motionRun(a,p,v,[{steps:120,command:{throttle:1,steering:0,brake:0}},{steps:60,command:NEUTRAL},{steps:120,command:{throttle:0,steering:0,brake:1}},{steps:120,command:{throttle:-1,steering:0,brake:0}}]);
   expect(r.minimumWheelContacts).toBe(4);expect(r.occupiedFrames).toBe(0);expect(r.recoveries).toBe(0);
   expect(r.frames[0].speed).toBeGreaterThan(5.7);expect(r.frames[1].speed).toBeLessThan(r.frames[0].speed);expect(Math.abs(r.frames[2].speed)).toBeLessThan(.001);expect(r.frames[3].speed).toBeLessThan(-2.9);
   v.reset();expect(v.frames.current?.position.x).toBeCloseTo(v.start.pose!.position.x,3);
  }finally{v.dispose();p.dispose();}
 });
 it.each(catalogue.zones.slice(0,2))('$label blocks prepared building faces/corners at 8 m/s and permits driven off-road return',zone=>{
  const a=JSON.parse(readFileSync(`public/zones/${zone.id}.zone.json`,'utf8')) as ZoneArtifact,p=createPhysicalWorld(a),v=createVehicle(p,a);
  try{
   const candidates=preparedWalls(a,p);
   for(const kind of ['head','glancing','corner']){
    const list=kind==='corner'?candidates.corners:candidates.starts;let result;
    for(const c of list){
     v.reset();v.submit(NEUTRAL);stepVehicle(p,v,120);const r=contactRun(p,v,c.x,c.z,c.yaw+(kind==='glancing'?.4:0),8);
     if(r.contactFrames){result=r;break;}
    }
    expect(result,kind).toBeDefined();expect(result!.maximumPenetration).toBeLessThanOrEqual(VEHICLE.contactTolerance);expect(result!.contactFrames).toBeGreaterThan(40);expect(result!.occupiedFrames).toBe(0);expect(result!.recoveries).toBe(0);
   }
   v.reset();v.submit(NEUTRAL);stepVehicle(p,v,120);
   const r=motionRun(a,p,v,[{steps:60,command:{throttle:1,steering:0,brake:0}},{steps:90,command:{throttle:1,steering:1,brake:0}},{steps:120,command:{throttle:0,steering:1,brake:1}},{steps:zone.label==='Cambridge centre'?160:190,command:{throttle:-1,steering:1,brake:0}},{steps:120,command:{throttle:0,steering:1,brake:1}}]);
   expect(r.frames[0].fullyPaved).toBe(true);expect(r.offroadFrames).toBeGreaterThan(100);expect(r.frames[2].fullyPaved).toBe(false);expect(r.frames.at(-1)!.fullyPaved).toBe(true);
   expect(r.minimumWheelContacts).toBeGreaterThanOrEqual(3);expect(r.occupiedFrames).toBe(0);expect(r.recoveries).toBe(0);expect(Math.abs(r.frames.at(-1)!.speed)).toBeLessThan(.001);
  }finally{v.dispose();p.dispose();}
 });
});
