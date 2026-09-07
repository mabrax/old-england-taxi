import {describe,expect,it} from 'vitest';
import {createVehicleView} from '../src/lib/scene/vehicle-view';
import type {VehicleSnapshot} from '../src/lib/physics/vehicle';
import {WHEEL_CONNECTIONS} from '../src/lib/physics/vehicle-config';
describe('chassis and wheel interpolation',()=>{
 it('interpolates position, shortest quaternion arc, suspension, steering and unwrapped spin together; reset snaps',()=>{
  const view=createVehicleView();
  const a:VehicleSnapshot={position:{x:0,y:1,z:0},rotation:{x:0,y:0,z:0,w:1},wheels:WHEEL_CONNECTIONS.map(()=>({length:.3,steering:0,rotation:6}))};
  const b:VehicleSnapshot={position:{x:2,y:1.2,z:4},rotation:{x:0,y:1,z:0,w:0},wheels:WHEEL_CONNECTIONS.map(()=>({length:.5,steering:.4,rotation:7}))};
  view.update(a,b,.5);expect(view.root.position.toArray()).toEqual([1,1.1,2]);expect(view.root.quaternion.y).toBeCloseTo(Math.SQRT1_2);
  const wheel=view.root.children.at(-1)!;expect(wheel.position.y).toBeCloseTo(-.5);expect(wheel.rotation.y).toBeCloseTo(.2);expect(wheel.children[0].rotation.x).toBeCloseTo(6.5);
  view.update(a,a,.9);expect(view.root.position.toArray()).toEqual([0,1,0]);expect(wheel.children[0].rotation.x).toBe(6);
  view.root.traverse((child:any)=>{child.geometry?.dispose();child.material?.dispose();});
 });
});
