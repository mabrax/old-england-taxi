import * as THREE from 'three';
import { VEHICLE, WHEEL_CONNECTIONS } from '../physics/vehicle-config';
import type { VehicleSnapshot } from '../physics/vehicle';

/** Plain cuboid taxi: every visible chassis detail stays inside the collision dimensions. */
export function createVehicleView() {
  const root = new THREE.Group(); root.name = 'first-vehicle';
  const body = new THREE.Mesh(new THREE.BoxGeometry(VEHICLE.halfWidth * 2, VEHICLE.halfHeight * 2, VEHICLE.halfLength * 2),
    new THREE.MeshStandardMaterial({ color: 0xf0bc24, roughness: 0.7 }));
  root.add(body);
  const addPanel = (width: number, height: number, x: number, y: number, z: number, color: number) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -8 }));
    panel.position.set(x, y, z); root.add(panel); return panel;
  };
  addPanel(1.6, 0.32, 0, 0.2, VEHICLE.halfLength, 0x253e49);
  for (const x of [-0.7, 0.7]) {
    addPanel(0.32, 0.16, x, -0.2, VEHICLE.halfLength, 0xffffd1);
    addPanel(0.32, 0.16, x, -0.2, -VEHICLE.halfLength, 0xc93430);
  }
  const roof = addPanel(1.15, 1.25, 0, VEHICLE.halfHeight, -0.3, 0x253e49); roof.rotation.x = -Math.PI / 2;
  const wheels = WHEEL_CONNECTIONS.map(connection => {
    const steer = new THREE.Group(); steer.position.set(connection.x, connection.y, connection.z);
    const spin = new THREE.Group(); steer.add(spin);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(VEHICLE.wheelRadius, VEHICLE.wheelRadius, VEHICLE.wheelWidth, 16), new THREE.MeshStandardMaterial({ color: 0x222727 }));
    tyre.rotation.z = Math.PI / 2; spin.add(tyre);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(VEHICLE.wheelWidth + 0.002, 0.08, 0.48), new THREE.MeshStandardMaterial({ color: 0xb9c3c3 }));
    spin.add(spoke); root.add(steer); return { steer, spin };
  });
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
  return {
    root,
    update(previous: VehicleSnapshot, current: VehicleSnapshot, alpha: number) {
      alpha = Math.max(0, Math.min(1, alpha));
      const mix = (a: number, b: number) => a + (b - a) * alpha;
      root.position.set(mix(previous.position.x, current.position.x), mix(previous.position.y, current.position.y), mix(previous.position.z, current.position.z));
      q0.set(previous.rotation.x, previous.rotation.y, previous.rotation.z, previous.rotation.w);
      q1.set(current.rotation.x, current.rotation.y, current.rotation.z, current.rotation.w);
      root.quaternion.copy(q0.slerp(q1, alpha));
      wheels.forEach(({ steer, spin }, i) => {
        const a = previous.wheels[i], b = current.wheels[i];
        steer.position.y = WHEEL_CONNECTIONS[i].y - mix(a.length, b.length);
        steer.rotation.y = mix(a.steering, b.steering);
        spin.rotation.x = mix(a.rotation, b.rotation);
      });
    }
  };
}
