import * as THREE from 'three';

export interface ViewportSize {
  width: number;
  height: number;
}

export interface CameraFrame {
  centerX: number;
  centerZ: number;
  span: number;
}

const DEFAULT_CAMERA_FRAME: CameraFrame = {
  centerX: 0,
  centerZ: 0,
  span: 12
};

export function getViewportSize(element: {
  getBoundingClientRect: () => { width: number; height: number };
}): ViewportSize {
  const bounds = element.getBoundingClientRect();

  return {
    width: Math.max(1, Math.floor(bounds.width)),
    height: Math.max(1, Math.floor(bounds.height))
  };
}

export function clampPixelRatio(pixelRatio: number, maximum = 2): number {
  return Math.min(Math.max(pixelRatio || 1, 1), maximum);
}

export function createValidationCamera(
  size: ViewportSize,
  frame: CameraFrame = DEFAULT_CAMERA_FRAME
): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    42,
    size.width / size.height,
    Math.max(0.1, frame.span / 1_000),
    Math.max(120, frame.span * 5)
  );
  camera.position.set(
    frame.centerX + frame.span * 0.72,
    frame.span * 1.15,
    frame.centerZ + frame.span * 0.92
  );
  camera.lookAt(frame.centerX, 0, frame.centerZ);
  return camera;
}

export function resizeValidationCamera(
  camera: THREE.PerspectiveCamera,
  size: ViewportSize
): void {
  camera.aspect = size.width / size.height;
  camera.updateProjectionMatrix();
}
