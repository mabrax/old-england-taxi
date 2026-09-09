import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {createPhysicalWorld,initializeRapier} from '../../src/lib/physics/physical-world';
import {createVehicle} from '../../src/lib/physics/vehicle';
import {vehicleFixture} from '../../tests/helpers/vehicle-fixture';
import {VEHICLE,NEUTRAL} from '../../src/lib/physics/vehicle-config';
import {stepVehicle,contactRun,preparedWalls,motionRun} from './vehicle-evidence';
import type {ZoneArtifact} from '../../src/lib/zone/types';
await initializeRapier();
const catalogue=JSON.parse(readFileSync('public/zones/index.json','utf8'));
const results=[];
for(const zone of catalogue.zones){
 const bytes=readFileSync(`public/zones/${zone.id}.zone.json`),a=JSON.parse(bytes.toString()) as ZoneArtifact;
 const p=createPhysicalWorld(a),time=performance.now(),v=createVehicle(p,a),spawnMs=performance.now()-time;
 const result:any={id:zone.id,label:zone.label,sha256:createHash('sha256').update(bytes).digest('hex'),spawnMs,start:v.start};
 if(v.body){
  stepVehicle(p,v,120);
  result.motion=motionRun(a,p,v,[{steps:120,command:{throttle:1,steering:0,brake:0}},{steps:60,command:NEUTRAL},{steps:120,command:{throttle:0,steering:0,brake:1}},{steps:120,command:{throttle:-1,steering:0,brake:0}},{steps:120,command:{throttle:0,steering:0,brake:1}}]);
  if(['Cambridge centre','Chicago River North grid'].includes(a.label)){
   const starts=preparedWalls(a,p);result.contacts=[];
   for(const kind of ['head','glancing','corner'] as const){
    let selected;
    for(const candidate of kind==='corner'?starts.corners:starts.starts){
      v.reset();v.submit(NEUTRAL);stepVehicle(p,v,120);
      const r=contactRun(p,v,candidate.x,candidate.z,candidate.yaw+(kind==='glancing'?.4:0),8);
      if(r.contactFrames>0){selected={kind,candidate,result:r};break;}
    }
    result.contacts.push(selected??{kind,failure:'No accessible contact found'});
   }
   v.reset();v.submit(NEUTRAL);stepVehicle(p,v,120);
   result.offroad=motionRun(a,p,v,[{steps:60,command:{throttle:1,steering:0,brake:0}},{steps:90,command:{throttle:1,steering:1,brake:0}},{steps:120,command:{throttle:0,steering:1,brake:1}},{steps:a.label==='Cambridge centre'?160:190,command:{throttle:-1,steering:1,brake:0}},{steps:120,command:{throttle:0,steering:1,brake:1}}]);
  }
 }
 results.push(result);console.log(a.label,JSON.stringify({spawnMs,start:v.start,motion:result.motion?.frames.map((f:any)=>({speed:f.speed,position:f.position})),contacts:result.contacts?.map((c:any)=>({kind:c.kind,penetration:c.result?.maximumPenetration,contactFrames:c.result?.contactFrames,occupied:c.result?.occupiedFrames,recoveries:c.result?.recoveries})),offroad:result.offroad&&{offroadFrames:result.offroad.offroadFrames,frames:result.offroad.frames.map((f:any)=>({position:f.position,paved:f.fullyPaved})),recoveries:result.offroad.recoveries}}));
 v.dispose();p.dispose();
}
const controlledContacts=[];
for(const [kind,x,z,yaw,speed] of [
 ['head',0,-20,0,8],['glancing',0,-20,.55,8],['corner',-16,-16,Math.PI/4,8],['reverse',0,-20,Math.PI,-3],
 ['boundary-east',90,-40,Math.PI/2,8],['boundary-west',-90,-40,-Math.PI/2,8],['boundary-north',35,-50,Math.PI,8],['boundary-south',35,90,0,8]
] as [string,number,number,number,number][]){
 const a=vehicleFixture(),p=createPhysicalWorld(a),v=createVehicle(p,a);stepVehicle(p,v,120);
 controlledContacts.push({kind,...contactRun(p,v,x,z,yaw,speed)});v.dispose();p.dispose();
}
writeFileSync(process.argv[2]??'/tmp/phase02-vehicle.json',JSON.stringify({checkedAt:new Date().toISOString(),runtime:process.version,cpu:cpus()[0].model,rapier:'0.20.0',configuration:VEHICLE,results,controlledContacts},null,2)+'\n');
