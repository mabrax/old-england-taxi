import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  clampPixelRatio,
  createValidationCamera,
  getViewportSize,
  resizeValidationCamera,
  type ViewportSize
} from './camera';

export interface SceneController {
  resetCamera: () => void;
  resize: () => void;
  dispose: () => void;
}

const palette = {
  ground: 0xe6ebe9,
  gridMinor: 0xcbd5d2,
  gridMajor: 0xaebdb8,
  navy: 0x314d5a,
  sage: 0x6d8d83,
  clay: 0xb5775f,
  sand: 0xc7a66a
};

export function createValidationScene(container: HTMLElement): SceneController {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd9e2e1);

  const initialSize = getViewportSize(container);
  const camera = createValidationCamera(initialSize);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const controls = new OrbitControls(camera, renderer.domElement);

  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.minDistance = 4;
  controls.maxDistance = 32;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 0.35, 0);

  renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio));
  renderer.setSize(initialSize.width, initialSize.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'scene-canvas';
  renderer.domElement.setAttribute('aria-label', 'Three.js neutral validation scene');
  container.appendChild(renderer.domElement);

  const hemisphereLight = new THREE.HemisphereLight(0xf4f7f5, 0x87928e, 2.2);
  scene.add(hemisphereLight);

  const keyLight = new THREE.DirectionalLight(0xfff8ed, 3.1);
  keyLight.position.set(5, 10, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -12;
  keyLight.shadow.camera.right = 12;
  keyLight.shadow.camera.top = 12;
  keyLight.shadow.camera.bottom = -12;
  scene.add(keyLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 28),
    new THREE.MeshStandardMaterial({ color: palette.ground, roughness: 0.94, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(28, 28, palette.gridMajor, palette.gridMinor);
  grid.position.y = 0.012;
  scene.add(grid);

  const testObjects = new THREE.Group();
  testObjects.name = 'phase-00-primitives';
  scene.add(testObjects);

  addBox(testObjects, { x: -2.6, y: 0.75, z: -1.3 }, { x: 1.8, y: 1.5, z: 1.8 }, palette.navy);
  addBox(testObjects, { x: 2.4, y: 0.55, z: 1.2 }, { x: 2.2, y: 1.1, z: 1.4 }, palette.sage);
  addSphere(testObjects, { x: -1.3, y: 0.85, z: 2.4 }, 0.85, palette.clay);
  addSphere(testObjects, { x: 2.4, y: 0.6, z: -2.6 }, 0.6, palette.sand);

  const defaultPosition = camera.position.clone();
  const defaultTarget = new THREE.Vector3(0, 0.35, 0);
  let disposed = false;
  let frame = 0;

  const render = () => {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    frame = window.requestAnimationFrame(render);
  };

  const resize = () => {
    if (disposed) return;
    const size = getViewportSize(container);
    renderer.setSize(size.width, size.height, false);
    resizeValidationCamera(camera, size);
    renderer.render(scene, camera);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(container);

  const resetCamera = () => {
    camera.position.copy(defaultPosition);
    controls.target.copy(defaultTarget);
    controls.update();
    renderer.render(scene, camera);
  };

  render();

  return {
    resetCamera,
    resize,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}

function addBox(
  group: THREE.Group,
  position: THREE.Vector3Like,
  size: THREE.Vector3Like,
  color: number
): void {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshStandardMaterial({ color, roughness: 0.76, metalness: 0.04 })
  );
  mesh.position.set(position.x, position.y, position.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addSphere(
  group: THREE.Group,
  position: THREE.Vector3Like,
  radius: number,
  color: number
): void {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 20),
    new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.08 })
  );
  mesh.position.set(position.x, position.y, position.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}
