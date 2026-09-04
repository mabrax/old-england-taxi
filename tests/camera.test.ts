import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  clampPixelRatio,
  createValidationCamera,
  getViewportSize,
  resizeValidationCamera
} from '../src/lib/scene/camera';

describe('viewport camera helpers', () => {
  it('normalizes a measured viewport to usable integer dimensions', () => {
    const size = getViewportSize({
      getBoundingClientRect: () => ({ width: 639.8, height: 0 })
    });

    expect(size).toEqual({ width: 639, height: 1 });
  });

  it('keeps pixel density inside the rendering budget', () => {
    expect(clampPixelRatio(3.5)).toBe(2);
    expect(clampPixelRatio(0)).toBe(1);
    expect(clampPixelRatio(1.5)).toBe(1.5);
  });

  it('updates the perspective camera when the viewport changes', () => {
    const camera = createValidationCamera({ width: 800, height: 400 });

    expect(camera.aspect).toBe(2);
    resizeValidationCamera(camera, { width: 400, height: 800 });

    expect(camera.aspect).toBe(0.5);
    expect(camera.projectionMatrix).toBeInstanceOf(THREE.Matrix4);
  });
});
