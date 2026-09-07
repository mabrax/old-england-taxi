import * as THREE from 'three';
import { createVehicleView } from './vehicle-view';
import type { VehicleCommand } from '../physics/vehicle-config';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ZoneQa } from '../zone/catalogue';
import type { ZoneArtifact } from '../zone/types';
import { createPhysicsSession, type PhysicsState } from '../physics/physics-session';
import { BOUNDARY_HEIGHT_METRES } from '../physics/world-geometry';
import {
  clampPixelRatio,
  createValidationCamera,
  getViewportSize,
  resizeValidationCamera,
  type ViewportSize
} from './camera';

export interface SceneController {
  resetCamera: () => void;
  inspectVehicle: () => void;
  resetVehicle: () => void;
  exerciseVehicle: (command: VehicleCommand) => void;
  resize: () => void;
  dispose: () => void;
  setQaVisibility: (source: boolean, generated: boolean) => void;
  setCollisionVisibility: (visible: boolean) => void;
  setPhysicsPaused: (paused: boolean) => void;
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
  qa?: ZoneQa,
  onPhysicsState: (state: PhysicsState) => void = () => {}
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
    new THREE.MeshStandardMaterial({
      color: palette.ground, roughness: 0.94, metalness: 0,
      // Keep the base below the grid and roads in the depth buffer at distant angles.
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
    })
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
      metalness: 0,
      // A 4 cm world-space lift alone loses depth precision when zoomed out.
      // Bias the surface toward the camera while retaining building occlusion.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
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
    if (!generated) physics.pause();
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
  let collisionVisible = false;
  const collisionInspection = new THREE.Group();
  scene.add(collisionInspection);
  const simulationLimit = new THREE.Group();
  scene.add(simulationLimit);
  const vehicleView = createVehicleView();
  vehicleView.root.visible = false;
  scene.add(vehicleView.root);
  const physics = createPhysicsSession(artifact, state => {
    renderer.domElement.dataset.physicsStatus = state.status;
    renderer.domElement.dataset.vehicleStatus = state.vehicle?.status ?? 'loading';
    renderer.domElement.dataset.physicsColliders = String(state.metrics?.colliders ?? 0);
    renderer.domElement.dataset.physicsSetupMs = String(state.metrics?.setupMs ?? 0);
    renderer.domElement.dataset.physicsInitializationMs = String(state.initializationMs ?? 0);
    if (state.status === 'error') {
      collisionInspection.visible = simulationLimit.visible = vehicleView.root.visible = false;
    }
    onPhysicsState(state);
  });
  renderer.domElement.dataset.physicsStatus = 'loading';
  void physics.ready.then(() => {
    if (disposed || !physics.physical) return;
    try {
      const physical = physics.physical;
      const debug = physical.debugRender();
      const geometry = new THREE.BufferGeometry();
      // Static world: take one copy, never rebuild/upload every frame.
      geometry.setAttribute('position', new THREE.BufferAttribute(debug.vertices.slice(), 3));
      const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
        color: 0x087c83, depthTest: false, transparent: true, opacity: 0.65
      }));
      lines.renderOrder = 11;
      collisionInspection.add(lines);
      collisionInspection.visible = collisionVisible;
      const e = physical.envelope;
      const points: number[] = [];
      const corners = [[e.minimumX, e.minimumZ], [e.maximumX, e.minimumZ],
        [e.maximumX, e.maximumZ], [e.minimumX, e.maximumZ]];
      // Ground perimeter plus short uprights identify the artificial limit without obscuring the map.
      for (let i = 0; i < 4; i++) {
        const [x, z] = corners[i], [nx, nz] = corners[(i + 1) % 4];
        points.push(x, 0.08, z, nx, 0.08, nz, x, 0.08, z, x, 3, z);
      }
      const boundaryGeometry = new THREE.BufferGeometry();
      boundaryGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const boundaryLines = new THREE.LineSegments(boundaryGeometry, new THREE.LineBasicMaterial({ color: 0x995200, depthTest: false }));
      boundaryLines.renderOrder = 12;
      simulationLimit.add(boundaryLines);
      renderer.domElement.dataset.playEnvelope = JSON.stringify(e);
      renderer.domElement.dataset.boundaryHeight = String(BOUNDARY_HEIGHT_METRES);
    } catch (error) { physics.fail(error); }
  });

  const render = (now = performance.now()) => {
    if (disposed) return;
    physics.advance(now);
    const frames = physics.vehicle?.frames;
    vehicleView.root.visible = !!frames?.current;
    if (frames?.current && frames.previous) {
      vehicleView.update(frames.previous, frames.current, physics.alpha);
      renderer.domElement.dataset.vehiclePose = JSON.stringify(frames.current);
      renderer.domElement.dataset.vehicleSpeed = String(physics.vehicle?.speed);
      renderer.domElement.dataset.vehicleResets = String(physics.vehicle?.state.resets);
      renderer.domElement.dataset.vehicleRecoveries = String(physics.vehicle?.state.recoveries);
    }
    renderer.domElement.dataset.physicsSteps = String(physics.timing.steps);
    controls.update();
    renderer.render(scene, camera);
    frame = document.hidden ? 0 : window.requestAnimationFrame(render);
  };

  const pause = () => physics.pause();
  const visibilityChanged = () => {
    physics.pause();
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    if (!document.hidden && !disposed) render();
  };
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('blur', pause);

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
    if (disposed) return;
    controls.minDistance = span * 0.18;
    camera.position.copy(defaultPosition);
    controls.target.copy(defaultTarget);
    controls.update();
    renderer.render(scene, camera);
  };

  render();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    physics.dispose();
    window.cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', visibilityChanged);
    window.removeEventListener('blur', pause);
    window.removeEventListener('pagehide', pageHidden);
    window.removeEventListener('pageshow', pageShown);
    observer.disconnect();
    controls.dispose();
    disposeObject(scene);
    renderer.dispose();
    renderer.domElement.remove();
  };
  // Release the world on navigation too. A bfcache return reloads the disposed page.
  const pageShown = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
  const pageHidden = (event: PageTransitionEvent) => {
    dispose();
    if (event.persisted) window.addEventListener('pageshow', pageShown, { once: true });
  };
  window.addEventListener('pagehide', pageHidden);

  return {
    resetCamera,
    inspectVehicle: () => {
      const pose = physics.vehicle?.frames.current;
      if (disposed || !pose) return;
      physics.pause(); controls.minDistance = 3;
      controls.target.set(pose.position.x, pose.position.y, pose.position.z);
      camera.position.set(pose.position.x + 10, pose.position.y + 9, pose.position.z + 12);
      controls.update();
    },
    resetVehicle: () => { if (!disposed) physics.resetVehicle(); },
    exerciseVehicle: command => {
      if (!disposed && !document.hidden && document.hasFocus() && roads.visible && buildings.visible) physics.exercise(command);
    },
    resize,
    setQaVisibility,
    setCollisionVisibility: (visible: boolean) => {
      collisionVisible = visible;
      collisionInspection.visible = visible && !!physics.physical;
      renderer.domElement.dataset.collisionVisible = String(collisionInspection.visible);
    },
    setPhysicsPaused: (paused: boolean) => {
      if (paused || document.hidden || !document.hasFocus() || !roads.visible || !buildings.visible) physics.pause(); else physics.resume();
    },
    dispose
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
