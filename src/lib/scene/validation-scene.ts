import * as THREE from 'three';
import { createBenchmarkReplay, type BenchmarkFixture, type BenchmarkReplay } from '../benchmark/replay';
import { createDrivingInput, type DrivingAction } from './driving-input';
import { createChaseCamera } from './chase-camera';
import { onPageExit } from './page-lifetime';
import { NEUTRAL } from '../physics/vehicle-config';

export type DrivingMode = 'inspect' | 'driving' | 'paused';
export interface DrivingState { mode: DrivingMode; message: string; speed: number; onPavement?: boolean }
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
  benchmark?: { start: () => void; snapshot: BenchmarkReplay['snapshot'] };
  resetCamera: () => void;
  drive: () => void;
  pauseDriving: (reason?: string) => void;
  setDrivingBlocked: (blocked: boolean) => void;
  pointerDown: (event: PointerEvent, action: DrivingAction) => void;
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
  onPhysicsState: (state: PhysicsState) => void = () => {},
  onDrivingState: (state: DrivingState) => void = () => {},
  benchmarkFixture?: BenchmarkFixture
): SceneController {
  // Opt-in, passive qualification instrumentation. Observers consume and clear entries;
  // no pose mutation or physics/control handle is exposed to the browser harness.
  const measuring = new URLSearchParams(window.location.search).get('qualify') === '1';
  const benchmark = benchmarkFixture ? createBenchmarkReplay(benchmarkFixture, undefined, name => {
    performance.mark(name); performance.clearMarks(name);
    window.dispatchEvent(new Event(name));
  }) : undefined;
  const measure = (name: string, start: number, end: number) => {
    performance.measure(name, { start, end });
    performance.clearMeasures(name);
  };
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
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-description', 'Drive with WASD or arrow keys. Space brakes. Escape pauses. R resets the vehicle.');
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
    if (!generated) inspect('Inspection pauses driving while geometry is hidden.');
    overlays.visible = source;
    roads.visible = buildings.visible = generated;
    renderer.domElement.dataset.sourceVisible = String(source);
    renderer.domElement.dataset.generatedVisible = String(generated);
  };
  setQaVisibility(!!qa, true);

  const defaultPosition = camera.position.clone();
  const defaultTarget = new THREE.Vector3(centerX, 0, centerZ);
  let disposed = false;
  let mode: DrivingMode = 'inspect';
  let blocked = false;
  let message = 'Inspect the zone, or choose Drive when the vehicle is ready.';
  let lastFrame: number | undefined;
  let lastFeedback = 0;
  const notify = () => {
    renderer.domElement.dataset.drivingMode = mode;
    renderer.domElement.dataset.cameraOwner = mode === 'inspect' ? 'orbit' : 'chase';
    onDrivingState({ mode, message, speed: physics.vehicle?.speed ?? 0, onPavement: physics.vehicle?.onPavement });
  };
  const pauseDriving = (reason = 'Paused. Release controls, then Resume driving.') => {
    if (disposed) return;
    benchmark?.invalidate(reason);
    input.clear(); physics.pause();
    if (mode !== 'inspect') mode = 'paused';
    message = reason; lastFrame = undefined; notify();
  };
  const chase = createChaseCamera(camera, (from, to, radius) => physics.physical?.cameraSweep(from, to, radius) ?? 1);
  const input = createDrivingInput(renderer.domElement, {
    active: () => !disposed && mode === 'driving', pause: pauseDriving, reset: () => resetVehicle()
  });
  const inspect = (reason = 'Inspection pauses driving. Drag to orbit; scroll or pinch to zoom.') => {
    pauseDriving(reason); mode = 'inspect';
    camera.up.set(0, 1, 0);
    controls.target.copy(vehicleView.root.visible ? vehicleView.root.position : defaultTarget);
    // Drain old orbit damping before handing ownership back. The chase never calls update().
    controls.enableDamping = false; controls.update(); controls.enableDamping = true;
    controls.enabled = true; notify();
  };
  const resetVehicle = () => {
    if (disposed) return;
    pauseDriving(); physics.resetVehicle(); chase.reset();
    message = physics.vehicle?.state.status === 'ready' ? 'Vehicle reset to its safe start. Release controls, then Resume driving.' : physics.vehicle?.state.message ?? 'Vehicle unavailable.';
    if (mode === 'inspect') inspectVehicle();
    notify();
  };
  const inspectVehicle = () => {
    const pose = physics.vehicle?.frames.current;
    if (disposed) return;
    if (!pose) { inspect(); resetCamera(); return; }
    inspect(); controls.minDistance = 3;
    controls.target.set(pose.position.x, pose.position.y, pose.position.z);
    camera.position.set(pose.position.x + 10, pose.position.y + 9, pose.position.z + 12);
    controls.update();
  };
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
    if (state.status !== 'running' && benchmark?.active && !benchmark.pendingComplete) benchmark.invalidate(state.message ?? `Physics ${state.status}`);
    renderer.domElement.dataset.physicsStatus = state.status;
    renderer.domElement.dataset.vehicleStatus = state.vehicle?.status ?? 'loading';
    renderer.domElement.dataset.physicsColliders = String(state.metrics?.colliders ?? 0);
    renderer.domElement.dataset.physicsSetupMs = String(state.metrics?.setupMs ?? 0);
    renderer.domElement.dataset.physicsInitializationMs = String(state.initializationMs ?? 0);
    if (state.status !== 'running' && mode === 'driving') {
      mode = 'paused'; input.clear(); chase.reset();
      message = state.vehicle?.recoveries ? 'Vehicle recovered from an escaped, fallen or invalid state. Release controls, then Resume driving.' : state.vehicle?.message ?? state.message ?? 'Driving paused.';
    }
    if (state.status === 'error') {
      collisionInspection.visible = simulationLimit.visible = vehicleView.root.visible = false;
    }
    onPhysicsState(state);
    notify();
  }, undefined, measuring ? (start, end) => measure('driveability:step', start, end) : undefined, benchmark?.driver);
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
    const started = measuring ? performance.now() : 0;
    if (mode === 'driving' && !benchmark) physics.submit(input.command());
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
    if (mode === 'inspect') controls.update();
    else if (frames?.current) {
      const result = chase.update({ position: vehicleView.root.position, rotation: vehicleView.root.quaternion }, lastFrame === undefined ? 0 : (now - lastFrame) / 1000);
      renderer.domElement.dataset.chaseCamera = JSON.stringify(result);
    }
    lastFrame = now;
    if (now - lastFeedback > 150) {
      lastFeedback = now; notify();
      if (measuring) renderer.domElement.dataset.qualificationResources = JSON.stringify({
        ...renderer.info.memory, programs: renderer.info.programs?.length,
        colliders: physics.physical?.world.colliders.len() ?? 0,
        bodies: physics.physical?.world.bodies.len() ?? 0,
        controllers: physics.physical?.world.vehicleControllers.size ?? 0,
        droppedMs: physics.timing.droppedMs
      });
    }
    renderer.render(scene, camera);
    if (measuring) measure('driveability:frame', started, performance.now());
    if (benchmark?.active) {
      benchmark.afterFrame();
      if (!benchmark.active) { physics.pause(); notify(); }
    }
    frame = document.hidden ? 0 : window.requestAnimationFrame(render);
  };

  const pause = () => pauseDriving('Window focus lost. Resume driving when ready.');
  const orientationChanged = () => pauseDriving('Orientation changed. Release controls, then Resume driving.');
  window.addEventListener('orientationchange', orientationChanged);
  const visibilityChanged = () => {
    pauseDriving('Page visibility changed. Resume driving when ready.');
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    if (!document.hidden && !disposed) render();
  };
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('blur', pause);
  const benchmarkInput = () => { if (benchmark?.active) pauseDriving('User input during benchmark'); };
  if (benchmark) {
    window.addEventListener('keydown', benchmarkInput, true);
    window.addEventListener('pointerdown', benchmarkInput, true);
  }

  const resize = () => {
    if (disposed) return;
    if (benchmark?.active && benchmarkFixture && (window.innerWidth !== benchmarkFixture.viewport.width || window.innerHeight !== benchmarkFixture.viewport.height || window.devicePixelRatio !== benchmarkFixture.viewport.deviceScaleFactor)) {
      pauseDriving('Benchmark viewport changed');
    }
    const size = getViewportSize(container);
    renderer.setSize(size.width, size.height, false);
    resizeValidationCamera(camera, size);
    renderer.render(scene, camera);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(container);

  const resetCamera = () => {
    if (disposed) return;
    if (benchmark?.active) pauseDriving('Camera reset during benchmark');
    if (mode !== 'inspect') { chase.reset(); return; }
    camera.up.set(0, 1, 0);
    controls.minDistance = span * 0.18;
    camera.position.copy(defaultPosition);
    controls.target.copy(defaultTarget);
    controls.update();
    renderer.render(scene, camera);
  };

  render();

  const dispose = () => {
    if (disposed) return;
    benchmark?.invalidate('Scene disposed');
    disposed = true;
    input.dispose();
    physics.dispose();
    window.cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', visibilityChanged);
    window.removeEventListener('blur', pause);
    window.removeEventListener('orientationchange', orientationChanged);
    if (benchmark) {
      window.removeEventListener('keydown', benchmarkInput, true);
      window.removeEventListener('pointerdown', benchmarkInput, true);
    }
    detachPageExit();
    observer.disconnect();
    controls.dispose();
    disposeObject(scene);
    renderer.dispose();
    renderer.domElement.remove();
  };
  const detachPageExit = onPageExit(dispose);

  const drive = () => {
    if (disposed || blocked || document.hidden || !document.hasFocus() || !roads.visible || !buildings.visible || physics.vehicle?.state.status !== 'ready') return;
    input.clear(); physics.pause();
    controls.enableDamping = false; controls.update(); controls.enableDamping = true;
    controls.enabled = false; controls.minDistance = 3;
    camera.near = 0.1; camera.updateProjectionMatrix();
    chase.reset(); lastFrame = undefined;
    mode = 'driving'; message = 'Driving · S / ↓ brakes, then reverses. Space holds the brake.';
    renderer.domElement.focus({ preventScroll: true });
    physics.resume(); physics.submit(NEUTRAL); notify();
  };

  return {
    benchmark: benchmark && benchmarkFixture ? {
      snapshot: () => ({ ...benchmark.snapshot(), timing: { ...physics.timing }, resources: {
        colliders: physics.physical?.world.colliders.len() ?? 0,
        bodies: physics.physical?.world.bodies.len() ?? 0,
        controllers: physics.physical?.world.vehicleControllers.size ?? 0,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length
      } }),
      start() {
        const v = benchmarkFixture.viewport;
        if (disposed || blocked || document.hidden || !document.hasFocus() || benchmark.snapshot().phase !== 'ready' || physics.vehicle?.state.status !== 'ready' || physics.timing.steps !== 0 ||
            window.innerWidth !== v.width || window.innerHeight !== v.height || window.devicePixelRatio !== v.deviceScaleFactor || qa || collisionVisible || !roads.visible || !buildings.visible) throw new Error('Benchmark needs a fresh ready foreground scene at 1440×900 / DPR 1 with QA off');
        drive(); benchmark.start();
        message = 'Benchmark running. Keep this window in the foreground; inspect the trace after completion.'; notify();
      }
    } : undefined,
    resetCamera,
    inspectVehicle,
    resetVehicle,
    drive,
    pauseDriving,
    setDrivingBlocked: value => {
      blocked = value;
      if (value) pauseDriving('Location work in progress. Driving is paused until it finishes.');
    },
    pointerDown: input.pointerDown,
    exerciseVehicle: command => {
      if (!disposed && !blocked && !document.hidden && document.hasFocus() && roads.visible && buildings.visible) { inspect(); physics.exercise(command); }
    },
    resize,
    setQaVisibility,
    setCollisionVisibility: (visible: boolean) => {
      collisionVisible = visible;
      collisionInspection.visible = visible && !!physics.physical;
      renderer.domElement.dataset.collisionVisible = String(collisionInspection.visible);
    },
    setPhysicsPaused: (paused: boolean) => {
      if (paused || blocked || document.hidden || !document.hasFocus() || !roads.visible || !buildings.visible) pauseDriving(); else physics.resume();
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
