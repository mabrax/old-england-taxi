/** Offline evidence helpers; no runtime spawn overrides or compiler imports. */
import type { ZoneArtifact } from '../../src/lib/zone/types';
import type { PhysicalWorld } from '../../src/lib/physics/physical-world';
import { createVehicle, type FirstVehicle } from '../../src/lib/physics/vehicle';
import { VEHICLE, rotate, yawPose, type VehicleCommand } from '../../src/lib/physics/vehicle-config';
import { vehicleBounds, indexPavement, pavementRectangle } from '../../src/lib/physics/vehicle-spawn';
import { Cuboid } from '@dimforge/rapier3d-compat';
import { boxPenetration } from './box-contact';
export function stepVehicle(p: PhysicalWorld, v: FirstVehicle, steps: number, inspect: () => void = () => {}) {
  for (let i=0;i<steps;i++) { v.beforeStep(); p.step(); v.afterStep(); inspect(); }
}
export function observe(p: PhysicalWorld, v: FirstVehicle) {
  const body=v.body!;const position=body.translation(), rotation=body.rotation();
  let penetration=0, contacts=0, reportedShapePenetration=0, buildingContacts=0, boundaryContacts=0, groundContacts=0;
  const classify = (other: ReturnType<typeof body.collider>) => {
    if (!(other.shape instanceof Cuboid)) buildingContacts++;
    else if (other.translation().y < 0) groundContacts++;
    else boundaryContacts++;
  };
  p.world.contactPairsWith(body.collider(0), other=>p.world.contactPair(body.collider(0),other,manifold=>{
    if (manifold.numContacts()) classify(other);
    for(let i=0;i<manifold.numContacts();i++){contacts++;if(!(other.shape instanceof Cuboid))penetration=Math.max(penetration,-manifold.contactDist(i));}
  }));
  // Fresh shape contacts check the POST-step body, independently of solver manifold timing.
  p.world.forEachCollider(other=>{
    if (other.parent()) return;
    const contact=body.collider(0).contactCollider(other,0);
    if(contact){contacts++;classify(other);reportedShapePenetration=Math.max(reportedShapePenetration,-contact.distance);}
    const shape=other.shape;
    if (shape instanceof Cuboid) {
      penetration=Math.max(penetration,boxPenetration({position,rotation}, {x:VEHICLE.halfWidth,y:VEHICLE.halfHeight,z:VEHICLE.halfLength},
        {position:other.translation(),rotation:other.rotation()}, shape.halfExtents));
    } else if(contact) penetration=Math.max(penetration,-contact.distance);
  });
  const bounds=vehicleBounds({position,rotation}),e=p.envelope;
  const centreOccupied=p.occupied({minimumX:position.x,maximumX:position.x,minimumY:position.y,maximumY:position.y,minimumZ:position.z,maximumZ:position.z});
  return { position:{...position},rotation:{...rotation}, speed:v.speed, penetration,reportedShapePenetration,contacts,buildingContacts,boundaryContacts,groundContacts,centreOccupied,
    boundaryOverhang:Math.max(0,e.minimumX-bounds.minimumX,bounds.maximumX-e.maximumX,e.minimumZ-bounds.minimumZ,bounds.maximumZ-e.maximumZ),
    wheelContacts:[0,1,2,3].filter(i=>v.controller!.wheelIsInContact(i)).length,
    minimumChassisY:position.y-Math.abs(rotate({x:VEHICLE.halfWidth,y:0,z:0},rotation).y)-Math.abs(rotate({x:0,y:VEHICLE.halfHeight,z:0},rotation).y)-Math.abs(rotate({x:0,y:0,z:VEHICLE.halfLength},rotation).y)
  };
}
export function contactRun(p: PhysicalWorld, v: FirstVehicle, x:number,z:number,yaw:number,speed:number,steering=0,steps=240) {
  const pose=yawPose(x,z,yaw);pose.position.y=0.809;
  v.body!.setTranslation(pose.position,true);v.body!.setRotation(pose.rotation,true);
  v.body!.setLinvel(rotate({x:0,y:0,z:speed},pose.rotation),true);v.body!.setAngvel({x:0,y:0,z:0},true);
  v.submit({throttle:0,steering:0,brake:0});v.submit({throttle:Math.sign(speed),steering,brake:0});
  let maximumPenetration=0, maximumReportedShapePenetration=0, contactFrames=0, buildingContactFrames=0,boundaryContactFrames=0,occupiedFrames=0,minimumChassisY=Infinity,maximumBoundaryOverhang=0,maximumSpeed=0;
  const traces: ReturnType<typeof observe>[] = [];
  stepVehicle(p,v,steps,()=>{
    const o=observe(p,v);maximumPenetration=Math.max(maximumPenetration,o.penetration);maximumReportedShapePenetration=Math.max(maximumReportedShapePenetration,o.reportedShapePenetration);contactFrames+=Number(o.contacts>0);
    buildingContactFrames+=Number(o.buildingContacts>0);boundaryContactFrames+=Number(o.boundaryContacts>0);
    occupiedFrames+=Number(o.centreOccupied);minimumChassisY=Math.min(minimumChassisY,o.minimumChassisY);
    maximumBoundaryOverhang=Math.max(maximumBoundaryOverhang,o.boundaryOverhang);maximumSpeed=Math.max(maximumSpeed,Math.abs(o.speed));
    if(traces.length<5 && (contactFrames===1 || traces.length===0))traces.push(o);
  });
  return { initial:{x,z,yaw,speed,steering},maximumPenetration,maximumReportedShapePenetration,contactFrames,buildingContactFrames,boundaryContactFrames,occupiedFrames,minimumChassisY,maximumBoundaryOverhang,maximumSpeed,recoveries:v.state.recoveries, final:observe(p,v),traces };
}
export function preparedWalls(a:ZoneArtifact,p:PhysicalWorld) {
  const mesh=a.geometry.buildings,points=mesh.positions,seen=new Set<string>();
  const walls=[];
  for(let i=0;i<mesh.indices.length;i+=3){
    const [a,b,c]=mesh.indices.slice(i,i+3).map(id=>({x:points[id*3],y:points[id*3+1],z:points[id*3+2]}));
    if(a.y===b.y && b.y===c.y)continue;
    const ends=[...new Map([a,b,c].map(v=>[`${v.x},${v.z}`,v])).values()];if(ends.length!==2)continue;
    const key=ends.map(v=>`${v.x},${v.z}`).sort().join('|');if(seen.has(key))continue;seen.add(key);
    const nx=(b.y-a.y)*(c.z-a.z)-(b.z-a.z)*(c.y-a.y),nz=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),n=Math.hypot(nx,nz);
    if(!n)continue;
    walls.push({a:ends[0],b:ends[1],nx:nx/n,nz:nz/n,length:Math.hypot(ends[0].x-ends[1].x,ends[0].z-ends[1].z)});
  }
  walls.sort((a,b)=>b.length-a.length);
  const starts=[];
  for(const wall of walls){
    if(wall.length<12)continue;
    const x=(wall.a.x+wall.b.x)/2+wall.nx*10,z=(wall.a.z+wall.b.z)/2+wall.nz*10,yaw=Math.atan2(-wall.nx,-wall.nz);
    if(p.clearance(vehicleBounds(yawPose(x,z,yaw),.15),1).clear)starts.push({x,z,yaw,wall});
    if(starts.length===20)break;
  }
  const corners=[];
  for(const w of walls)for(const end of [w.a,w.b]){
    if(w.length<8)continue;
    const adjacent=walls.find(v=>v!==w && v.length>=8 && [v.a,v.b].some(b=>Math.hypot(b.x-end.x,b.z-end.z)<.001) && Math.abs(v.nx*w.nx+v.nz*w.nz)<.3);
    if(!adjacent)continue;
    const nx=w.nx+adjacent.nx,nz=w.nz+adjacent.nz,n=Math.hypot(nx,nz);
    const x=end.x+nx/n*9,z=end.z+nz/n*9,yaw=Math.atan2(-nx,-nz);
    if(p.clearance(vehicleBounds(yawPose(x,z,yaw),.15),1).clear)corners.push({x,z,yaw,corner:{x:end.x,z:end.z}});
    if(corners.length===20)break;
  }
  return {starts,corners};
}
export function motionRun(a:ZoneArtifact,p:PhysicalWorld,v:FirstVehicle,sequence:{steps:number;command:VehicleCommand}[]) {
  const pavement=indexPavement(a.geometry.roads);const frames=[];
  let offroadFrames=0,fullyPavedFrames=0,minimumWheelContacts=4,maximumSpeed=0,occupiedFrames=0;
  for(const action of sequence){
    v.submit(action.command);
    stepVehicle(p,v,action.steps,()=>{
      const o=observe(p,v),t=o.position;
      const centrePaved=pavement.covers([{x:t.x-.01,z:t.z-.01},{x:t.x+.01,z:t.z-.01},{x:t.x+.01,z:t.z+.01},{x:t.x-.01,z:t.z+.01}]);
      offroadFrames+=Number(!centrePaved);
      fullyPavedFrames+=Number(pavement.covers(pavementRectangle({position:o.position,rotation:o.rotation})));
      occupiedFrames+=Number(o.centreOccupied);minimumWheelContacts=Math.min(minimumWheelContacts,o.wheelContacts);maximumSpeed=Math.max(maximumSpeed,Math.abs(o.speed));
    });
    frames.push({...observe(p,v),fullyPaved:pavement.covers(pavementRectangle({position:v.body!.translation(),rotation:v.body!.rotation()}))});
  }
  return {sequence,frames,offroadFrames,fullyPavedFrames,minimumWheelContacts,maximumSpeed,occupiedFrames,recoveries:v.state.recoveries};
}
