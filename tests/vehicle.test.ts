import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createPhysicalWorld,initializeRapier } from '../src/lib/physics/physical-world';
import { createVehicle } from '../src/lib/physics/vehicle';
import { NEUTRAL, VEHICLE, WHEEL_CONNECTIONS, transform, rotate } from '../src/lib/physics/vehicle-config';
import { vehicleFixture } from './helpers/vehicle-fixture';
import { contactRun,observe,stepVehicle } from '../tools/physics/vehicle-evidence';
beforeAll(initializeRapier);
function setup(){const a=vehicleFixture(),p=createPhysicalWorld(a),v=createVehicle(p,a);return {a,p,v,dispose:()=>{v.dispose();p.dispose();}};}
describe('ray-cast vehicle operating envelope',()=>{
  it('reports pavement departure without moving or recovering the vehicle',()=>{
    const {v,dispose}=setup();try{
      expect(v.onPavement).toBe(true);
      v.body!.setTranslation({x:0,y:1.02,z:50},true);v.clearInput();
      expect(v.onPavement).toBe(false);expect(v.body!.translation().z).toBe(50);expect(v.state.recoveries).toBe(0);
      v.reset();expect(v.onPavement).toBe(true);
    }finally{dispose();}
  });
  it('supports four wheels, accelerates, coasts, brakes to rest and reverses with explicit speed limits',()=>{
    const {p,v,dispose}=setup();try{
      stepVehicle(p,v,120);expect(observe(p,v).wheelContacts).toBe(4);expect(v.body!.mass()).toBeCloseTo(1100);
      const start={...v.body!.translation()};v.submit({throttle:1,steering:0,brake:0});stepVehicle(p,v,240);
      expect(v.speed).toBeGreaterThan(7.9);expect(v.speed).toBeLessThanOrEqual(8.01);
      v.submit(NEUTRAL);stepVehicle(p,v,60);expect(v.speed).toBeGreaterThan(6);expect(v.speed).toBeLessThan(7.5);
      const before={...v.body!.translation()};v.submit({throttle:0,steering:0,brake:1});stepVehicle(p,v,120);
      const after=v.body!.translation();expect(Math.abs(v.speed)).toBeLessThan(.001);expect(Math.hypot(after.x-before.x,after.z-before.z)).toBeLessThan(5);
      v.submit({throttle:-1,steering:0,brake:0});v.submit({throttle:-1,steering:0,brake:0});stepVehicle(p,v,180);expect(v.speed).toBeLessThan(-2.9);expect(v.speed).toBeGreaterThan(-3.01);
      expect(v.body!.translation().x-start.x).toBeGreaterThan(10);expect(observe(p,v).wheelContacts).toBe(4);expect(v.state.recoveries).toBe(0);
    }finally{dispose();}
  });
  it('post-step wheel snapshots put the visible tyres on ground while the chassis pitches and turns',()=>{
    const {p,v,dispose}=setup();try{
      stepVehicle(p,v,120);v.submit({throttle:1,steering:.5,brake:0});
      stepVehicle(p,v,120,()=>{
        const frame=v.frames.current!;
        for(let i=0;i<4;i++){
          const c=WHEEL_CONNECTIONS[i],w=frame.wheels[i];
          const centre=transform({x:c.x,y:c.y-w.length,z:c.z},frame);
          const axle=rotate({x:Math.cos(w.steering),y:0,z:-Math.sin(w.steering)},frame.rotation);
          const bottom=centre.y-VEHICLE.wheelRadius*Math.sqrt(1-axle.y*axle.y)-VEHICLE.wheelWidth/2*Math.abs(axle.y);
          expect(bottom).toBeGreaterThan(-.01);expect(bottom).toBeLessThan(.01);
        }
      });
    }finally{dispose();}
  });
  it.each([1,-1])('stops from the supported speed in direction %i within 5 m and 1.2 s',direction=>{
    const {p,v,dispose}=setup();try{
      stepVehicle(p,v,120);v.submit({throttle:direction,steering:0,brake:0});stepVehicle(p,v,240);
      const speed=Math.abs(v.speed),start={...v.body!.translation()};expect(speed).toBeGreaterThan(direction===1?7.9:2.9);
      v.submit({throttle:0,steering:0,brake:1});let stoppedAt=0;
      for(let i=1;i<=72;i++){stepVehicle(p,v,1);if(!stoppedAt&&Math.abs(v.speed)<.01)stoppedAt=i;}
      const end=v.body!.translation();expect(stoppedAt).toBeGreaterThan(0);expect(Math.hypot(end.x-start.x,end.z-start.z)).toBeLessThan(5);
    }finally{dispose();}
  });
  it('opposing throttle brakes first, brake wins and invalid input releases controls',()=>{
    const {p,v,dispose}=setup();try{
      stepVehicle(p,v,120);v.submit({throttle:1,steering:0,brake:0});stepVehicle(p,v,120);
      v.submit({throttle:-0.01,steering:0,brake:0});v.beforeStep();expect(v.controller!.wheelEngineForce(0)).toBe(0);expect(v.controller!.wheelBrake(0)).toBe(VEHICLE.brakeImpulse);p.step();v.afterStep();
      v.submit({throttle:-1,steering:0,brake:0});stepVehicle(p,v,180);expect(v.speed).toBeLessThan(-2.9);
      v.submit({throttle:1,steering:0,brake:1});v.beforeStep();expect(v.controller!.wheelEngineForce(0)).toBe(0);p.step();v.afterStep();
      expect(v.submit({throttle:NaN,steering:0,brake:0})).toBe(false);expect(v.state.inputReady).toBe(false);
      expect(v.submit({throttle:1,steering:0,brake:0})).toBe(false);
    }finally{dispose();}
  });
  it.each([['head',0,-20,0,8],['glancing',0,-20,.55,8],['corner',-16,-16,Math.PI/4,8],['reverse',0,-20,Math.PI,-3]] as const)('%s contact blocks the fully rotating chassis at supported speed',(name,x,z,yaw,speed)=>{
    const {p,v,dispose}=setup();try{
      stepVehicle(p,v,120);const result=contactRun(p,v,x,z,yaw,speed);
      expect(result.contactFrames).toBeGreaterThan(40);expect(result.maximumPenetration).toBeLessThanOrEqual(VEHICLE.contactTolerance);
      expect(result.occupiedFrames).toBe(0);expect(result.minimumChassisY).toBeGreaterThan(-VEHICLE.contactTolerance);expect(result.recoveries).toBe(0);
    }finally{dispose();}
  });
  it.each([3,5,8])('corner approach variation at %i m/s stays blocked',speed=>{
    for(const distance of [5,5.07,8,8.11]){const {p,v,dispose}=setup();try{
      stepVehicle(p,v,120);const r=contactRun(p,v,-10-distance/Math.SQRT2,-10-distance/Math.SQRT2,Math.PI/4,speed,0,180);
      expect(r.contactFrames).toBeGreaterThan(0);expect(r.maximumPenetration).toBeLessThanOrEqual(VEHICLE.contactTolerance);expect(r.occupiedFrames).toBe(0);expect(r.recoveries).toBe(0);
    }finally{dispose();}}
  });
  it.each([['east',90,-40,Math.PI/2],['west',-90,-40,-Math.PI/2],['north',35,-50,Math.PI],['south',35,90,0]] as const)('%s boundary blocks motion without interpreting normal contact as escape',(_,x,z,yaw)=>{
    const {p,v,dispose}=setup();try{
      stepVehicle(p,v,120);const r=contactRun(p,v,x,z,yaw,8);expect(r.contactFrames).toBeGreaterThan(40);
      expect(r.maximumPenetration).toBeLessThanOrEqual(VEHICLE.contactTolerance);expect(r.maximumBoundaryOverhang).toBeLessThan(.04);expect(r.recoveries).toBe(0);
    }finally{dispose();}
  });
  it('reset revalidates and clears forces, velocity, controls, wheel state and interpolation repeatedly',()=>{
    const {p,v,dispose}=setup();try{
      for(let i=0;i<12;i++){
        v.submit(NEUTRAL);v.submit({throttle:1,steering:1,brake:0});stepVehicle(p,v,60);
        v.body!.addForce({x:1000,y:0,z:0},true);v.body!.addTorque({x:0,y:100,z:0},true);
        v.reset();expect(v.body!.linvel()).toEqual({x:0,y:0,z:0});expect(v.body!.angvel()).toEqual({x:0,y:0,z:0});
        expect(v.body!.userForce()).toEqual({x:0,y:0,z:0});expect(v.body!.userTorque()).toEqual({x:0,y:0,z:0});
        expect(v.controller!.wheelRotation(0)).toBe(0);expect(v.frames.previous).toEqual(v.frames.current);
        expect(v.submit({throttle:1,steering:1,brake:0})).toBe(false);stepVehicle(p,v,120);expect(Math.abs(v.speed)).toBeLessThan(.001);
        expect(p.world.bodies.len()).toBe(1);expect(p.world.colliders.len()).toBe(7);expect(p.world.vehicleControllers.size).toBe(1);
      }
      vi.spyOn(p,'clearance').mockReturnValue({clear:false,reasons:['building']});expect(v.reset()).toBe(false);expect(v.state.status).toBe('unavailable');expect(p.world.bodies.len()).toBe(0);
    }finally{dispose();}
  });
  it('allows an overturned explicit reset and recovers escaped, fallen and nonfinite states within one step',()=>{
    const {p,v,dispose}=setup();try{
      v.body!.setRotation({x:0,y:0,z:1,w:0},true);stepVehicle(p,v,120);expect(v.state.recoveries).toBe(0);v.reset();expect(rotate({x:0,y:1,z:0},v.body!.rotation()).y).toBeGreaterThan(.99);
      for(const position of [{x:300,y:1,z:0},{x:0,y:-5,z:0},{x:NaN,y:1,z:0}]){
        v.body!.setTranslation(position,true);v.beforeStep();expect(v.body!.translation().x).toBeCloseTo(v.start.pose!.position.x);p.step();v.afterStep();
      }
      expect(v.state.recoveries).toBe(3);expect(v.state.inputReady).toBe(false);
    }finally{dispose();}
  });
  it('partial vehicle construction failure and repeated dispose leave no body/controller',()=>{
    const a=vehicleFixture(),p=createPhysicalWorld(a);
    const spy=vi.spyOn(p.world,'createCollider').mockImplementationOnce(()=>{throw new Error('injected collider failure');});
    expect(()=>createVehicle(p,a)).toThrow('injected');expect(p.world.bodies.len()).toBe(0);expect(p.world.vehicleControllers.size).toBe(0);spy.mockRestore();
    const v=createVehicle(p,a);v.dispose();v.dispose();expect(p.world.colliders.len()).toBe(6);expect(v.submit(NEUTRAL)).toBe(false);p.dispose();
  });
});
