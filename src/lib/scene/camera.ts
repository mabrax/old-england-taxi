import * as THREE from 'three';

export interface ViewportSize {
  width: number;
  height: number;
}

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

export function createValidationCamera(size: ViewportSize): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(42, size.width / size.height, 0.1, 120);
  camera.position.set(8.5, 7.5, 10.5);
  camera.lookAt(0, 0.35, 0);
  return camera;
}

export function resizeValidationCamera(
  camera: THREE.PerspectiveCamera,
  size: ViewportSize
): void {
  camera.aspect = size.width / size.height;
  camera.updateProjectionMatrix();
}
