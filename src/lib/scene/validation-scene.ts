import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ZoneQa } from '../zone/catalogue';
import type { ZoneArtifact } from '../zone/types';
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
  setQaVisibility: (source: boolean, generated: boolean) => void;
}

const palette = {
  background: 0xd9e2e1,
  ground: 0xe8ece8,
  gridMinor: 0xd0d8d4,
  gridMajor: 0xaabbb5,
  road: 0x4b5960,
  building: 0xb8aa92
};

export function createValidationScene(
  container: HTMLElement,
  artifact: ZoneArtifact,
  qa?: ZoneQa
): SceneController {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.background);

  const bounds = artifact.coordinates.localBounds;
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
    `Three.js road and building zone for ${artifact.label}`
  );
  renderer.domElement.dataset.zoneSlug = artifact.slug;
  renderer.domElement.dataset.roadTriangles = String(
    artifact.geometry.roads.statistics.triangles
  );
  renderer.domElement.dataset.buildingTriangles = String(
    artifact.geometry.buildings.statistics.triangles
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
    new THREE.Float32BufferAttribute(artifact.geometry.roads.positions, 3)
  );
  roadGeometry.setIndex(artifact.geometry.roads.indices);
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
  roads.name = 'phase-05-road-surfaces';
  roads.position.y = 0.04;
  scene.add(roads);

  const buildingGeometry = new THREE.BufferGeometry();
  buildingGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(artifact.geometry.buildings.positions, 3)
  );
  buildingGeometry.setIndex(artifact.geometry.buildings.indices);
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
  buildings.name = 'phase-05-building-volumes';
  scene.add(buildings);

  const overlays = new THREE.Group();
  overlays.name = 'source-qa-overlays';
  if (qa) {
    // Batch line segments by kind and inclusion, rather than one draw call per OSM way.
    for (const kind of ['road', 'building'] as const) for (const included of [true, false]) {
      const positions: number[] = [];
      for (const line of qa.lines.filter(line => line.kind === kind && line.included === included)) {
        for (let i = 3; i < line.positions.length; i += 3) {
          for (let j = i - 3; j < i + 3; j++) positions.push(line.positions[j]);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
        color: included ? kind === 'road' ? 0x007fa3 : 0xb62980 : 0xe47b13,
        depthTest: false, transparent: true, opacity: 0.85
      }));
      lines.renderOrder = 10;
      overlays.add(lines);
    }
  }
  scene.add(overlays);
  renderer.domElement.dataset.qaLines = String(qa?.lines.length ?? 0);
  const setQaVisibility = (source: boolean, generated: boolean) => {
    overlays.visible = source;
    roads.visible = buildings.visible = generated;
    renderer.domElement.dataset.sourceVisible = String(source);
    renderer.domElement.dataset.generatedVisible = String(generated);
  };
  setQaVisibility(!!qa, true);

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
    setQaVisibility,
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
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.LineSegments)) return;
    child.geometry.dispose();

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}
