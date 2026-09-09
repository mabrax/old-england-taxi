import {beforeAll,describe,expect,it,vi} from 'vitest';
import {createPhysicsSession,STEP_MS} from '../src/lib/physics/physics-session';
import {initializeRapier} from '../src/lib/physics/physical-world';
import * as module from '../src/lib/physics/vehicle';
import {NEUTRAL} from '../src/lib/physics/vehicle-config';
import {vehicleFixture} from './helpers/vehicle-fixture';
beforeAll(initializeRapier);
const create=()=>createPhysicsSession(vehicleFixture(),()=>{},async()=>module);
describe('vehicle session ownership and render cadence',()=>{
 it('renders equal fixed-step motion at 30, 60, 120 and 144 Hz, and bounds stalled frames',async()=>{
  const positions=[];
  for(const hz of [30,60,120,144]){
   const s=create();await s.ready;
   expect(s.state.status).toBe('paused');expect(s.timing.steps).toBe(0);s.resume();s.submit({throttle:1,steering:.5,brake:0});
   for(let i=0;i<=hz*2;i++)s.advance(i*1000/hz);
   expect(s.timing.steps).toBe(120);positions.push(s.vehicle!.body!.translation());expect(s.alpha).toBeCloseTo(0,6);
   s.advance(100000);expect(s.timing.steps).toBe(125);expect(s.timing.droppedMs).toBeGreaterThan(97000);s.dispose();
  }
  for(const p of positions)expect(p).toEqual(positions[0]);
 });
 it('pause, neutral rearming, reset and fresh resume never apply held throttle or hidden time',async()=>{
  const s=create();await s.ready;s.resume();s.submit({throttle:1,steering:1,brake:0});s.advance(0);s.advance(50);
  s.pause();expect(s.vehicle!.state.inputReady).toBe(false);expect(s.vehicle!.controller!.wheelEngineForce(0)).toBe(0);
  expect(s.vehicle!.frames.previous).toEqual(s.vehicle!.frames.current);
  s.advance(1e6);s.resume();expect(s.submit({throttle:1,steering:1,brake:0})).toBe(false);
  s.advance(1e6);expect(s.timing.steps).toBe(3);expect(s.submit(NEUTRAL)).toBe(true);
  s.submit({throttle:1,steering:1,brake:0});s.resetVehicle();expect(s.state.status).toBe('paused');
  expect(s.vehicle!.frames.previous).toEqual(s.vehicle!.frames.current);
  s.resume();expect(s.submit({throttle:1,steering:1,brake:0})).toBe(false);s.advance(2e6);s.advance(2e6+STEP_MS);
  expect(s.timing.steps).toBe(4);expect(Math.abs(s.vehicle!.speed)).toBeLessThan(.001);s.dispose();
 });
 it('bounded exercises use exactly 60 steps, clear commands on interruption and pause on recovery',async()=>{
  const s=create();await s.ready;expect(s.exercise({throttle:1,steering:0,brake:0},601)).toBe(false);
  s.exercise({throttle:1,steering:0,brake:0});for(let i=0;i<=70;i++)s.advance(i*STEP_MS);
  expect(s.timing.steps).toBe(60);expect(s.state.status).toBe('paused');expect(s.vehicle!.controller!.wheelEngineForce(0)).toBe(0);
  s.exercise({throttle:1,steering:0,brake:0});s.advance(2000);s.advance(2050);s.pause();s.resume();
  for(let i=0;i<=70;i++)s.advance(3000+i*STEP_MS);expect(s.state.status).toBe('running');
  s.vehicle!.body!.setTranslation({x:10000,y:1,z:0},true);s.advance(4300);
  expect(s.state.status).toBe('paused');expect(s.vehicle!.state.recoveries).toBe(1);s.dispose();
 });
 it('repeated session disposal releases vehicle before world and failure frees both',async()=>{
  for(let i=0;i<6;i++){
   const s=create();await s.ready;const p=s.physical!,v=s.vehicle!,order:string[]=[];
   const vd=v.dispose,pd=p.dispose;vi.spyOn(v,'dispose').mockImplementation(()=>{order.push('vehicle');vd();});vi.spyOn(p,'dispose').mockImplementation(()=>{order.push('world');pd();});
   if(i===0){vi.spyOn(v,'afterStep').mockImplementation(()=>{throw new Error('injected sync failure');});s.resume();s.advance(0);s.advance(STEP_MS);expect(s.state.status).toBe('error');}
   s.dispose();s.dispose();expect(order).toEqual(['vehicle','world']);expect(s.vehicle).toBeUndefined();
  }
 });
});
