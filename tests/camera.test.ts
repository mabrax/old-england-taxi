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

  it('frames a metre-scale zone with matching clipping distances', () => {
    const camera = createValidationCamera(
      { width: 1_200, height: 800 },
      { centerX: 25, centerZ: -40, span: 1_000 }
    );

    expect(camera.position.toArray()).toEqual([745, 1_150, 880]);
    expect(camera.near).toBe(1);
    expect(camera.far).toBe(5_000);
  });
});
