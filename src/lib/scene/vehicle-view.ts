import * as THREE from 'three';
import { VEHICLE, WHEEL_CONNECTIONS } from '../physics/vehicle-config';
import type { VehicleSnapshot } from '../physics/vehicle';
import { DRIFT_PALETTE, createInkOutline, createToonGradient, toonMaterial } from './drift-style';

const SHADOW_HEIGHT = 0.07;

/** Cel-shaded taxi: every visible chassis detail stays inside the collision dimensions. */
export function createVehicleView(gradientMap: THREE.Texture = createToonGradient()) {
  const root = new THREE.Group(); root.name = 'first-vehicle';
  const { halfWidth: w, halfHeight: h, halfLength: l } = VEHICLE;
  const paint = toonMaterial(0xffc21a, gradientMap);
  const trim = toonMaterial(0x23262b, gradientMap);
  const glass = toonMaterial(0x2b3d52, gradientMap);
  const addBlock = (width: number, height: number, length: number, y: number, z: number, material: THREE.Material, shape?: (geometry: THREE.BoxGeometry) => void) => {
    const geometry = new THREE.BoxGeometry(width, height, length);
    shape?.(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, y, z);
    mesh.add(createInkOutline(geometry, 30));
    root.add(mesh); return mesh;
  };
  // Lower body, sloped glasshouse, roof and rooftop sign, stacked within ±halfHeight.
  const waist = 0.02, roofTop = h - 0.13, signBase = roofTop + 0.03;
  addBlock(w * 2, waist + h, l * 2, (waist - h) / 2, 0, paint);
  addBlock(w * 1.7, roofTop - waist, 2.2, (roofTop + waist) / 2, -0.2, glass, geometry => {
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) if (position.getY(i) > 0) {
      position.setZ(i, position.getZ(i) * 0.72 - 0.08);
      position.setX(i, position.getX(i) * 0.9);
    }
    geometry.computeVertexNormals();
  });
  addBlock(w * 1.45, 0.04, 1.45, roofTop + 0.01, -0.33, paint);
  const sign = addBlock(0.56, h - signBase, 0.22, (h + signBase) / 2, -0.25, toonMaterial(0xfff4c2, gradientMap, { emissive: 0x6e5a12 }));
  sign.name = 'taxi-sign';
  const addPanel = (width: number, height: number, x: number, y: number, z: number, color: number, emissive = 0) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshToonMaterial({ color, emissive, gradientMap, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -8 }));
    panel.position.set(x, y, z); root.add(panel); return panel;
  };
  for (const x of [-0.7, 0.7]) {
    addPanel(0.34, 0.14, x, -0.12, l, 0xffffe6, 0x8c8a6e);
    addPanel(0.32, 0.14, x, -0.12, -l, 0xd8322c, 0x5c0d0b);
  }
  addPanel(w * 2, 0.12, 0, -h + 0.06, l, 0x23262b);
  addPanel(w * 2, 0.12, 0, -h + 0.06, -l, 0x23262b);
  for (const x of [-w, w]) addPanel(l * 1.5, 0.08, x, -0.08, 0, 0x23262b).rotation.y = Math.PI / 2;

  // Hard-edged contact shadow kept on the flat ground plane beneath the chassis.
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w * 2.3, l * 2.15), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    uniforms: { color: { value: new THREE.Color(DRIFT_PALETTE.ink) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 color; varying vec2 vUv;
      void main() {
        vec2 q = abs(vUv - 0.5) * 2.0 - vec2(0.62, 0.8);
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.22;
        gl_FragColor = vec4(color, 0.42 * (1.0 - smoothstep(-0.04, 0.04, d)));
        #include <colorspace_fragment>
      }`
  }));
  shadow.name = 'contact-shadow'; shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = 1;
  root.add(shadow);

  const wheels = WHEEL_CONNECTIONS.map(connection => {
    const steer = new THREE.Group(); steer.position.set(connection.x, connection.y, connection.z);
    const spin = new THREE.Group(); steer.add(spin);
    const tyreGeometry = new THREE.CylinderGeometry(VEHICLE.wheelRadius, VEHICLE.wheelRadius, VEHICLE.wheelWidth, 18);
    const tyre = new THREE.Mesh(tyreGeometry, toonMaterial(0x1c1e21, gradientMap));
    tyre.rotation.z = Math.PI / 2; tyre.add(createInkOutline(tyreGeometry, 30, 0x050506)); spin.add(tyre);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(VEHICLE.wheelRadius * 0.62, VEHICLE.wheelRadius * 0.62, VEHICLE.wheelWidth + 0.004, 12), toonMaterial(0xd7dde2, gradientMap));
    hub.rotation.z = Math.PI / 2; spin.add(hub);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(VEHICLE.wheelWidth + 0.008, 0.07, 0.4), toonMaterial(0x6c747c, gradientMap));
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
      // The world is flat at y = 0; pitch and roll are small enough to keep the shadow in chassis space.
      shadow.position.y = SHADOW_HEIGHT - root.position.y;
      wheels.forEach(({ steer, spin }, i) => {
        const a = previous.wheels[i], b = current.wheels[i];
        steer.position.y = WHEEL_CONNECTIONS[i].y - mix(a.length, b.length);
        steer.rotation.y = mix(a.steering, b.steering);
        spin.rotation.x = mix(a.rotation, b.rotation);
      });
    }
  };
}
