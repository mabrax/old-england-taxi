/** New qualification runs over immutable prepared bytes; fixture placement never enters runtime. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPhysicalWorld,initializeRapier} from '../../src/lib/physics/physical-world';
import {createVehicle} from '../../src/lib/physics/vehicle';
import {createPhysicsSession,STEP_MS} from '../../src/lib/physics/physics-session';
import {createSpawnSearch} from '../../src/lib/physics/vehicle-spawn';
import {VEHICLE,NEUTRAL,rotate,yawPose} from '../../src/lib/physics/vehicle-config';
import {contactRun,preparedWalls,stepVehicle,observe,motionRun} from './vehicle-evidence';
import {vehicleFixture} from '../../tests/helpers/vehicle-fixture';
import {box} from '../../tests/helpers/physical-fixture';
import type {ZoneArtifact} from '../../src/lib/zone/types';
const out=process.argv[2]??'.zone-cache/phase-04/physics.json';
const report:any={checkedAt:new Date().toISOString(),runtime:process.version,rapier:'0.20.0',stepSeconds:1/60,maxCatchUp:5,configuration:VEHICLE,cells:[],controlled:[],cadence:[],failures:[]};
const check=(ok:boolean,message:string)=>{if(!ok)report.failures.push(message);};
const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n');
const forward={throttle:1,steering:0,brake:0},reverse={throttle:-1,steering:0,brake:0},brake={throttle:0,steering:0,brake:1};
await initializeRapier();
const zones=JSON.parse(readFileSync('public/zones/index.json','utf8')).zones;
for(const z of zones){
 const bytes=readFileSync(`public/zones/${z.id}.zone.json`),a=JSON.parse(bytes.toString()) as ZoneArtifact,p=createPhysicalWorld(a),v=createVehicle(p,a);
 const result:any={id:z.id,label:z.label,sha256:createHash('sha256').update(bytes).digest('hex'),envelope:p.envelope,start:v.start,contacts:[],queries:[]};report.cells.push(result);
 try{
 check(v.state.status==='ready'&&JSON.stringify(v.start)===JSON.stringify(createSpawnSearch(a,p).find()),z.label+' generic repeatable spawn');
 stepVehicle(p,v,120);result.motion=motionRun(a,p,v,[{steps:120,command:forward},{steps:60,command:NEUTRAL},{steps:120,command:brake},{steps:120,command:reverse},{steps:120,command:brake}]);
 const m=result.motion;check(m.minimumWheelContacts===4&&m.occupiedFrames===0&&m.recoveries===0,z.label+' supported normal motion');check(m.frames[0].speed>5.7&&Math.abs(m.frames[2].speed)<.001&&m.frames[3].speed<-2.9,z.label+' acceleration/stop/reverse');
 v.reset();result.reset={state:v.state,pose:v.frames.current,linear:v.body!.linvel(),angular:v.body!.angvel(),heldAccepted:v.submit(forward)};check(result.reset.heldAccepted===false&&Math.abs(v.speed)<.001,z.label+' reset');
 const candidates=preparedWalls(a,p);
 for(const kind of ['head','glancing','corner']){
  const attempts:any[]=[];result.contacts.push({kind,placement:'controlled mesh-derived clear test start; NOT generic runtime spawn',attempts});
  for(const c of kind==='corner'?candidates.corners:candidates.starts){
   v.reset();v.submit(NEUTRAL);stepVehicle(p,v,120);const r=contactRun(p,v,c.x,c.z,c.yaw+(kind==='glancing'?.4:0),8);
   attempts.push({candidate:c,...r});
   check(r.maximumPenetration<=.03&&r.occupiedFrames===0&&r.recoveries===0,z.label+' '+kind+' moving contact');
   if(r.buildingContactFrames>0){
    check(r.buildingContactFrames>40,z.label+' '+kind+' sustained building contact');
    if(kind==='head'){
     v.submit(brake);stepVehicle(p,v,120);let maximumPenetration=0,occupiedFrames=0,buildingContactFrames=0;stepVehicle(p,v,600,()=>{const s=observe(p,v);maximumPenetration=Math.max(maximumPenetration,s.penetration);occupiedFrames+=+s.centreOccupied;buildingContactFrames+=+(s.buildingContacts>0);});
     result.stationaryContact={steps:600,maximumPenetration,occupiedFrames,buildingContactFrames,final:observe(p,v)};check(maximumPenetration<=.03&&occupiedFrames===0,z.label+' stationary wall');
     v.reset();result.stuckReset={state:v.state,pose:v.frames.current};
    }break;
   }
  }check(attempts.some(r=>r.buildingContactFrames>40),z.label+' '+kind+' accessible test contact');
 }
 // Occupied point directly under a roof triangle; QA is not a collision source.
 const mesh=a.geometry.buildings;
 for(let i=0;i<mesh.indices.length;i+=3){const vs=mesh.indices.slice(i,i+3).map(id=>mesh.positions.slice(id*3,id*3+3));if(vs[0][1]>1&&vs.every(x=>x[1]===vs[0][1])){const x=vs.reduce((n,v)=>n+v[0],0)/3,z=vs.reduce((n,v)=>n+v[2],0)/3,b=box(x,z,0);const occupied=p.occupied(b);result.queries.push({kind:'roof-centroid occupied point',triangle:i/3,box:b,occupied});check(occupied,a.label+' roof interior occupancy');break;}}
 if(zones.indexOf(z)<2){v.reset();v.submit(NEUTRAL);stepVehicle(p,v,120);result.offroad=motionRun(a,p,v,[{steps:60,command:forward},{steps:90,command:{...forward,steering:1}},{steps:120,command:{...brake,steering:1}},{steps:z.label==='Cambridge centre'?160:190,command:{...reverse,steering:1}},{steps:120,command:{...brake,steering:1}}]);const r=result.offroad;check(r.offroadFrames>100&&r.frames.at(-1).fullyPaved&&r.minimumWheelContacts>=3&&r.recoveries===0&&r.occupiedFrames===0,z.label+' driven offroad return');}
 console.log(z.label,JSON.stringify({start:v.start,movingPenetration:Math.max(...result.contacts.flatMap((c:any)=>c.attempts.map((r:any)=>r.maximumPenetration))),stationary:result.stationaryContact?.maximumPenetration,failures:report.failures}));
 }finally{v.dispose();p.dispose();save();}
}
for(const [kind,x,z,yaw,speed] of [['head',0,-20,0,8],['glancing',0,-20,.55,8],['corner',-16,-16,Math.PI/4,8],['reverse',0,-20,Math.PI,-3],['boundary-east',90,-40,Math.PI/2,8],['boundary-west',-90,-40,-Math.PI/2,8],['boundary-north',35,-50,Math.PI,8],['boundary-south',35,90,0,8]] as [string,number,number,number,number][]){const a=vehicleFixture(),p=createPhysicalWorld(a),v=createVehicle(p,a);try{stepVehicle(p,v,120);const r=contactRun(p,v,x,z,yaw,speed);report.controlled.push({kind,...r});check(r.contactFrames>40&&r.maximumPenetration<=.03&&r.occupiedFrames===0&&r.recoveries===0,kind+' fixture');if(kind.startsWith('boundary'))check(r.maximumBoundaryOverhang<.04,kind+' envelope');}finally{v.dispose();p.dispose();}}
{
 const a=vehicleFixture(),p=createPhysicalWorld(a),v=createVehicle(p,a);try{
 report.courtyard={kind:'controlled closed extrusion with 8×8 m courtyard',open:{box:box(0,0),clearance:p.clearance(box(0,0))},occupied:{box:box(7,0),clearance:p.clearance(box(7,0))},concavity:{box:box(21,12),clearance:p.clearance(box(21,12))}};
 check(report.courtyard.open.clearance.clear&&!report.courtyard.occupied.clearance.clear&&report.courtyard.concavity.clearance.clear,'courtyard/concavity/occupied distinction');
 report.stopping=[];for(const direction of [1,-1]){v.reset();v.submit(NEUTRAL);stepVehicle(p,v,120);v.submit({...forward,throttle:direction});stepVehicle(p,v,240);const initial=observe(p,v);v.submit(brake);let stoppedAt=0;for(let i=1;i<=72;i++){stepVehicle(p,v,1);if(!stoppedAt&&Math.abs(v.speed)<.01)stoppedAt=i;}const final=observe(p,v),distance=Math.hypot(final.position.x-initial.position.x,final.position.z-initial.position.z);report.stopping.push({direction,initial,final,stoppedAt,seconds:stoppedAt/60,distance});check(stoppedAt>0&&distance<5,'maximum-speed stopping');}
 v.reset();v.body!.setRotation({x:0,y:0,z:1,w:0},true);stepVehicle(p,v,120);const overturned=observe(p,v);v.reset();report.recovery={overturned,manualReset:observe(p,v),cases:[]};check(rotate({x:0,y:1,z:0},v.body!.rotation()).y>.99,'overturned manual reset');
 for(const [kind,position] of [['escaped',{x:300,y:1,z:0}],['fallen',{x:0,y:-5,z:0}],['nonfinite',{x:NaN,y:1,z:0}]] as const){v.body!.setTranslation(position,true);v.beforeStep();p.step();v.afterStep();report.recovery.cases.push({kind,position:kind==='nonfinite'?'NaN x':position,state:v.state,final:observe(p,v)});check(Math.abs(v.body!.translation().x-v.start.pose!.position.x)<.01&&!v.state.inputReady,kind+' one-step recovery');}
 }finally{v.dispose();p.dispose();}
 const unsafe=vehicleFixture();for(const n of unsafe.streetGraph.nodes){n.position[0]+=10000;}const up=createPhysicalWorld(unsafe),uv=createVehicle(up,unsafe);report.unavailable={kind:'controlled graph hints outside envelope',state:uv.state,start:uv.start};check(uv.state.status==='unavailable'&&up.world.bodies.len()===0,'unsafe spawn');uv.dispose();up.dispose();
}
for(const hz of [30,60,120,144]){const s=createPhysicsSession(vehicleFixture(),()=>{},async()=>({initializeRapier,createPhysicalWorld,createVehicle}));await s.ready;s.resume();s.submit(NEUTRAL);s.advance(0);for(let i=1;i<=hz*2;i++)s.advance(i*1000/hz);s.submit(forward);for(let i=hz*2+1;i<=hz*4;i++)s.advance(i*1000/hz);report.cadence.push({hz,steps:s.timing.steps,pose:s.vehicle!.frames.current,speed:s.vehicle!.speed});check(s.timing.steps===240,'cadence '+hz);s.dispose();}
const first=report.cadence[0];for(const r of report.cadence)check(Math.abs(r.speed-first.speed)<1e-5&&Math.hypot(r.pose.position.x-first.pose.position.x,r.pose.position.z-first.pose.position.z)<1e-5,'cadence pose equivalence '+r.hz);

// Replay complete representative maneuvers through the actual fixed-step session at each render cadence.
report.cadenceManeuvers=[];
for(const kind of ['Chicago offroad','Cambridge offroad','fixture head contact','fixture east boundary'])for(const hz of [30,60,120,144]){
 const zi=kind==='Chicago offroad'?0:1,a=kind.startsWith('fixture')?vehicleFixture():JSON.parse(readFileSync(`public/zones/${zones[zi].id}.zone.json`,'utf8'));
 let maximumPenetration=0,occupiedFrames=0;const s=createPhysicsSession(a,()=>{},async()=>({initializeRapier,createPhysicalWorld,createVehicle}),()=>{const o=observe(s.physical!,s.vehicle!);maximumPenetration=Math.max(maximumPenetration,o.penetration);occupiedFrames+=+o.centreOccupied;});await s.ready;
 let now=0;s.resume();s.submit(NEUTRAL);s.advance(now);for(let i=0;i<hz*2;i++){now+=1000/hz;s.advance(now);}
 if(kind.startsWith('fixture')){const pose=kind.includes('east')?yawPose(90,-40,Math.PI/2):yawPose(0,-20,0);pose.position.y=.809;s.vehicle!.body!.setTranslation(pose.position,true);s.vehicle!.body!.setRotation(pose.rotation,true);s.vehicle!.body!.setLinvel(rotate({x:0,y:0,z:8},pose.rotation),true);s.vehicle!.body!.setAngvel({x:0,y:0,z:0},true);}
 const sequence=kind.startsWith('fixture')?[{steps:240,command:forward},{steps:120,command:brake},{steps:120,command:reverse},{steps:120,command:brake}]:[{steps:60,command:forward},{steps:90,command:{...forward,steering:1}},{steps:120,command:{...brake,steering:1}},{steps:zi===1?160:190,command:{...reverse,steering:1}},{steps:120,command:{...brake,steering:1}}];
 const endpoints=[];for(const action of sequence){s.submit(action.command);for(let i=0;i<action.steps*hz/60;i++){now+=1000/hz;s.advance(now);}endpoints.push({steps:s.timing.steps,pose:s.vehicle!.frames.current,speed:s.vehicle!.speed,onPavement:s.vehicle!.onPavement});}
 const r={kind,hz,sequence,endpoints,maximumPenetration,occupiedFrames,recoveries:s.vehicle!.state.recoveries};report.cadenceManeuvers.push(r);check(maximumPenetration<=.03&&occupiedFrames===0&&r.recoveries===0,kind+' safety at '+hz);
 const first=report.cadenceManeuvers.find((x:any)=>x.kind===kind);check(endpoints.every((e:any,i:number)=>e.steps===first.endpoints[i].steps&&Math.hypot(e.pose.position.x-first.endpoints[i].pose.position.x,e.pose.position.z-first.endpoints[i].pose.position.z)<1e-5),kind+' equal cadence endpoints '+hz);if(!kind.startsWith('fixture'))check(endpoints.at(-1)!.onPavement===true,kind+' pavement return '+hz);s.dispose();
}
save();console.log('Qualification failures:',report.failures);if(report.failures.length)process.exitCode=1;
