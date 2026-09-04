import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildingVolumePreview } from '../zone/building-volume-preview';
import { roadSurfacePreview } from '../zone/road-surface-preview';
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
  background: 0xd9e2e1,
  ground: 0xe8ece8,
  gridMinor: 0xd0d8d4,
  gridMajor: 0xaabbb5,
  road: 0x4b5960,
  building: 0xb8aa92
};

export function createValidationScene(container: HTMLElement): SceneController {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.background);

  const bounds = {
    minimumX: Math.min(
      roadSurfacePreview.bounds.minimumX,
      buildingVolumePreview.bounds.minimumX
    ),
    maximumX: Math.max(
      roadSurfacePreview.bounds.maximumX,
      buildingVolumePreview.bounds.maximumX
    ),
    minimumZ: Math.min(
      roadSurfacePreview.bounds.minimumZ,
      buildingVolumePreview.bounds.minimumZ
    ),
    maximumZ: Math.max(
      roadSurfacePreview.bounds.maximumZ,
      buildingVolumePreview.bounds.maximumZ
    )
  };
  const width = bounds.maximumX - bounds.minimumX;
  const depth = bounds.maximumZ - bounds.minimumZ;
  const span = Math.max(width, depth);
  const centerX = (bounds.minimumX + bounds.maximumX) / 2;
  const centerZ = (bounds.minimumZ + bounds.maximumZ) / 2;

  const initialSize = getViewportSize(container);
  const camera = createValidationCamera(initialSize, { centerX, centerZ, span });
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const controls = new OrbitControls(camera, renderer.domElement);

  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.minDistance = span * 0.18;
  controls.maxDistance = span * 4;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(centerX, 0, centerZ);

  renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio));
  renderer.setSize(initialSize.width, initialSize.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'scene-canvas';
  renderer.domElement.setAttribute(
    'aria-label',
    `Three.js road and building volume preview for ${roadSurfacePreview.label}`
  );
  container.appendChild(renderer.domElement);

  const hemisphereLight = new THREE.HemisphereLight(0xf7faf8, 0x87928e, 2.4);
  scene.add(hemisphereLight);

  const keyLight = new THREE.DirectionalLight(0xfff8ed, 2.2);
  keyLight.position.set(centerX + span * 0.5, span * 1.5, centerZ + span * 0.4);
  scene.add(keyLight);

  const groundMargin = span * 0.08;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(width + groundMargin, depth + groundMargin),
    new THREE.MeshStandardMaterial({ color: palette.ground, roughness: 0.94, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centerX, 0, centerZ);
  scene.add(ground);

  const grid = new THREE.GridHelper(
    span + groundMargin,
    10,
    palette.gridMajor,
    palette.gridMinor
  );
  grid.position.x = centerX;
  grid.position.y = 0.012;
  grid.position.z = centerZ;
  const gridMaterial = grid.material as THREE.LineBasicMaterial;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.34;
  scene.add(grid);

  const roadGeometry = new THREE.BufferGeometry();
  roadGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(roadSurfacePreview.positions, 3)
  );
  roadGeometry.setIndex(roadSurfacePreview.indices);
  roadGeometry.computeVertexNormals();
  roadGeometry.computeBoundingSphere();

  const roads = new THREE.Mesh(
    roadGeometry,
    new THREE.MeshStandardMaterial({
      color: palette.road,
      roughness: 0.92,
      metalness: 0
    })
  );
  roads.name = 'phase-03-road-surfaces';
  roads.position.y = 0.04;
  scene.add(roads);

  const buildingGeometry = new THREE.BufferGeometry();
  buildingGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(buildingVolumePreview.positions, 3)
  );
  buildingGeometry.setIndex(buildingVolumePreview.indices);
  buildingGeometry.computeVertexNormals();
  buildingGeometry.computeBoundingSphere();

  const buildings = new THREE.Mesh(
    buildingGeometry,
    new THREE.MeshStandardMaterial({
      color: palette.building,
      roughness: 0.88,
      metalness: 0
    })
  );
  buildings.name = 'phase-04-building-volumes';
  scene.add(buildings);

  const defaultPosition = camera.position.clone();
  const defaultTarget = new THREE.Vector3(centerX, 0, centerZ);
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

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}
