import * as THREE from 'three';
import type { StreetGraph, ZoneBounds3d } from '../zone/types';

/**
 * Cel-shaded "Drift City" presentation: banded sunlight, ink outlines, saturated sky,
 * window-gridded facades and painted road markings. Purely visual; no physics input.
 */
export const DRIFT_PALETTE = {
  zenith: 0x1f6fd1,
  horizon: 0xa8d3f2,
  haze: 0xc4dcef,
  sun: 0xfff6e0,
  skyFill: 0xbfdcff,
  groundFill: 0x8a8378,
  pavement: 0xcfcbc1,
  asphalt: 0x5d6266,
  curb: 0xeceae3,
  ink: 0x1b1d24,
  markingWhite: 0xf4f4ee,
  markingYellow: 0xf2b822,
  roof: 0x8e9196,
  glass: 0x27384d,
  glassHighlight: 0x6f93b8,
  shopfront: 0x4a3f3a,
  facades: [0xb9b4aa, 0xd8cdb6, 0x9a8f84, 0x8c5a46, 0xa7b4bf, 0xc9a98a, 0x7f8a94, 0xe2ddd2]
} as const;

/** World-space direction towards the sun (shared by the scene light and the facade shader). */
export const SUN_DIRECTION = new THREE.Vector3(0.45, 1, 0.3).normalize();

/** Three-step ramp for MeshToonMaterial: shadow, mid, lit. */
export function createToonGradient(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([150, 205, 255]), 3, 1, THREE.RedFormat);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function toonMaterial(color: number, gradientMap: THREE.Texture, extra: THREE.MeshToonMaterialParameters = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
}

/** Toon pavement that dissolves into the fog colour beyond the zone, hiding the plane's edge. */
export function createGroundMaterial(gradientMap: THREE.Texture, centerX: number, centerZ: number, fadeStart: number, fadeEnd: number) {
  const material = toonMaterial(DRIFT_PALETTE.pavement, gradientMap, {
    // Keep the base below the grid and roads in the depth buffer at distant angles.
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.groundFade = { value: new THREE.Vector4(centerX, centerZ, fadeStart, fadeEnd) };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vGroundXZ;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec4 groundFade;\nvarying vec2 vGroundXZ;\nvoid main() {')
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        #ifdef USE_FOG
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(groundFade.z, groundFade.w, length(vGroundXZ - groundFade.xy)));
        #endif`);
  };
  return material;
}

/** Gradient sky drawn at the far plane, independent of zone size and camera distance. */
export function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(DRIFT_PALETTE.zenith) },
      horizon: { value: new THREE.Color(DRIFT_PALETTE.horizon) },
      haze: { value: new THREE.Color(DRIFT_PALETTE.haze) },
      sun: { value: new THREE.Color(DRIFT_PALETTE.sun) },
      sunDirection: { value: SUN_DIRECTION }
    },
    vertexShader: /* glsl */`
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        vec4 clip = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
        gl_Position = clip.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 zenith, horizon, haze, sun, sunDirection;
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        float up = direction.y;
        vec3 color = mix(horizon, zenith, pow(smoothstep(0.0, 0.75, max(up, 0.0)), 0.8));
        color = mix(haze, color, smoothstep(-0.02, 0.12, up));
        float glow = max(dot(direction, sunDirection), 0.0);
        color = mix(color, sun, smoothstep(0.9965, 0.9985, glow) + 0.25 * pow(glow, 24.0));
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthFunc: THREE.LessEqualDepth
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
  sky.name = 'drift-sky'; sky.frustumCulled = false; sky.renderOrder = -1;
  return sky;
}

/**
 * Adds a `facade` attribute (u along wall, wall length, building height, palette index).
 * Walls are emitted as independent quads, so per-triangle extents give a stable wall frame.
 * Connected roof/wall vertices share one palette colour per building.
 */
export function prepareFacadeAttributes(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const vertexCount = position.count;
  const facade = new Float32Array(vertexCount * 4);
  const parent = new Int32Array(vertexCount).map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb); };

  // Above-ground coincident vertices join walls to their roof; ground vertices stay separate
  // so neighbouring buildings of different heights keep their own colour.
  const seen = new Map<string, number>();
  for (let i = 0; i < vertexCount; i++) {
    const y = position.getY(i);
    if (y < 0.01) continue;
    const key = `${Math.round(position.getX(i) * 100)},${Math.round(y * 100)},${Math.round(position.getZ(i) * 100)}`;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i); else union(first, i);
  }

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const triangles = index ? index.count / 3 : vertexCount / 3;
  const vertex = (t: number, k: number) => index ? index.getX(t * 3 + k) : t * 3 + k;
  for (let t = 0; t < triangles; t++) {
    const i0 = vertex(t, 0), i1 = vertex(t, 1), i2 = vertex(t, 2);
    union(i0, i1); union(i0, i2);
    a.fromBufferAttribute(position, i0); b.fromBufferAttribute(position, i1); c.fromBufferAttribute(position, i2);
    const normal = ab.subVectors(b, a).cross(ac.subVectors(c, a));
    const horizontal = Math.hypot(normal.x, normal.z);
    const height = Math.max(a.y, b.y, c.y);
    if (horizontal === 0 || Math.abs(normal.y) > horizontal) {
      for (const i of [i0, i1, i2]) facade[i * 4 + 2] = height;
      continue;
    }
    const tx = -normal.z / horizontal, tz = normal.x / horizontal;
    const projections = [a, b, c].map(p => p.x * tx + p.z * tz);
    const start = Math.min(...projections), length = Math.max(...projections) - start;
    [i0, i1, i2].forEach((i, k) => {
      facade[i * 4] = projections[k] - start; facade[i * 4 + 1] = length; facade[i * 4 + 2] = height;
    });
  }
  const colours = DRIFT_PALETTE.facades.length;
  for (let i = 0; i < vertexCount; i++) {
    let hash = Math.imul(find(i) ^ 0x9e3779b9, 0x85ebca6b);
    hash ^= hash >>> 13;
    facade[i * 4 + 3] = ((hash >>> 0) % colours);
  }
  geometry.setAttribute('facade', new THREE.BufferAttribute(facade, 4));
}

export function createFacadeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      palette: { value: DRIFT_PALETTE.facades.map(color => new THREE.Color(color)) },
      roof: { value: new THREE.Color(DRIFT_PALETTE.roof) },
      glass: { value: new THREE.Color(DRIFT_PALETTE.glass) },
      glassHighlight: { value: new THREE.Color(DRIFT_PALETTE.glassHighlight) },
      shopfront: { value: new THREE.Color(DRIFT_PALETTE.shopfront) },
      sunDirection: { value: SUN_DIRECTION }
    }]),
    vertexShader: /* glsl */`
      attribute vec4 facade;
      varying vec3 vWorld;
      varying vec3 vNormalWorld;
      varying vec4 vFacade;
      #include <fog_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        vFacade = facade;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 palette[${DRIFT_PALETTE.facades.length}];
      uniform vec3 roof, glass, glassHighlight, shopfront, sunDirection;
      varying vec3 vWorld;
      varying vec3 vNormalWorld;
      varying vec4 vFacade;
      #include <fog_pars_fragment>
      float box(vec2 p, vec2 lo, vec2 hi, vec2 aa) {
        vec2 inside = smoothstep(lo - aa, lo + aa, p) * (1.0 - smoothstep(hi - aa, hi + aa, p));
        return inside.x * inside.y;
      }
      void main() {
        vec3 n = normalize(vNormalWorld);
        float lambert = dot(n, sunDirection);
        float light = lambert > 0.5 ? 1.0 : lambert > 0.12 ? 0.84 : 0.68;
        vec3 wall = palette[int(vFacade.w + 0.5)];
        vec3 color = wall;
        if (n.y > 0.5) color = mix(roof, wall, 0.3);
        else if (abs(n.y) < 0.5 && vFacade.y > 1.8 && vFacade.z >= 3.0) {
          float storeyHeight = 3.4;
          float bays = max(1.0, floor(vFacade.y / 3.2));
          vec2 cell = vec2(vFacade.x / (vFacade.y / bays), vWorld.y / storeyHeight);
          vec2 aa = max(fwidth(cell), vec2(1e-4));
          vec2 local = fract(cell);
          float storey = floor(cell.y);
          float storeys = floor(vFacade.z / storeyHeight);
          bool shop = storey < 0.5 && vFacade.z >= 6.0;
          float frame = 0.0, pane = 0.0;
          if (storey < storeys) {
            if (shop) {
              frame = box(local, vec2(0.06, 0.08), vec2(0.94, 0.86), aa);
              pane = box(local, vec2(0.1, 0.12), vec2(0.9, 0.82), aa);
            } else {
              frame = box(local, vec2(0.2, 0.24), vec2(0.8, 0.86), aa);
              pane = box(local, vec2(0.25, 0.3), vec2(0.75, 0.8), aa);
            }
          }
          // Distant facades blend to their average tone instead of shimmering.
          float distant = smoothstep(0.18, 0.5, max(aa.x, aa.y));
          vec3 paneColor = mix(glass, glassHighlight, smoothstep(0.35, 0.95, local.y) * 0.55);
          vec3 frameColor = shop ? shopfront : min(wall * 1.18, vec3(1.0));
          vec3 detailed = mix(mix(shop ? mix(wall, shopfront, 0.55) : wall, frameColor, frame), paneColor, pane);
          vec3 average = mix(wall, glass, shop ? 0.5 : 0.22);
          color = mix(detailed, average, distant);
        }
        gl_FragColor = vec4(color * light, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
    // Ink edges share these surfaces exactly; push faces back so outlines stay visible.
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  });
}

export function createInkOutline(geometry: THREE.BufferGeometry, thresholdDegrees: number, color: number = DRIFT_PALETTE.ink): THREE.LineSegments {
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, thresholdDegrees), new THREE.LineBasicMaterial({ color }));
  lines.name = 'ink-outline';
  return lines;
}

type Segment = [x0: number, z0: number, x1: number, z1: number];

/** Flat quads of the given width centred on each segment (world-space width stays stable at distance). */
export function createStripGeometry(segments: Segment[], width: number, y: number): THREE.BufferGeometry {
  const positions = new Float32Array(segments.length * 12);
  const indices: number[] = [];
  segments.forEach(([x0, z0, x1, z1], s) => {
    const length = Math.hypot(x1 - x0, z1 - z0) || 1;
    const ox = -(z1 - z0) / length * width / 2, oz = (x1 - x0) / length * width / 2;
    positions.set([x0 + ox, y, z0 + oz, x0 - ox, y, z0 - oz, x1 - ox, y, z1 - oz, x1 + ox, y, z1 + oz], s * 12);
    const v = s * 4;
    // Wound counter-clockwise from above so the strips face up.
    indices.push(v, v + 2, v + 1, v, v + 3, v + 2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Outer boundary of the flat road surface, used as a painted curb edge. */
export function roadBoundarySegments(roads: THREE.BufferGeometry): Segment[] {
  const edges = new THREE.EdgesGeometry(roads, 10);
  const p = edges.getAttribute('position');
  const segments: Segment[] = [];
  for (let i = 0; i < p.count; i += 2) segments.push([p.getX(i), p.getZ(i), p.getX(i + 1), p.getZ(i + 1)]);
  edges.dispose();
  return segments;
}

const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link']);
const UNMARKED = new Set(['service', 'living_street']);
const DASH = 3, DASH_PERIOD = 9;

/**
 * Centre-line markings from the undirected street graph: double yellow on wide major roads,
 * dashed white elsewhere. Trimmed at junctions and clipped to the zone bounds.
 * Decorative only: markings carry no direction or legal-route meaning.
 */
export function roadMarkingSegments(graph: StreetGraph, bounds: ZoneBounds3d): { yellow: Segment[]; white: Segment[] } {
  const nodes = new Map(graph.nodes.map(node => [node.id, node.position]));
  const degree = new Map<number, number>(), junctionWidth = new Map<number, number>();
  for (const edge of graph.edges) for (const id of [edge.from, edge.to]) {
    degree.set(id, (degree.get(id) ?? 0) + 1);
    junctionWidth.set(id, Math.max(junctionWidth.get(id) ?? 0, edge.widthMetres));
  }
  const ways = new Map<number, StreetGraph['edges']>();
  for (const edge of graph.edges) {
    const way = ways.get(edge.sourceWayId) ?? [];
    way.push(edge); ways.set(edge.sourceWayId, way);
  }
  const yellow: Segment[] = [], white: Segment[] = [];
  for (const edges of ways.values()) {
    edges.sort((first, second) => first.sourceSegmentIndex - second.sourceSegmentIndex);
    let travelled = 0;
    for (const edge of edges) {
      const from = nodes.get(edge.from), to = nodes.get(edge.to);
      if (!from || !to) continue;
      const [x0, , z0] = from, [x1, , z1] = to;
      const length = Math.hypot(x1 - x0, z1 - z0);
      const start = travelled; travelled += length;
      if (length < 0.5 || edge.widthMetres < 5.5 || UNMARKED.has(edge.highway)) continue;
      const trim = (id: number) => (degree.get(id) ?? 0) >= 3 ? ((junctionWidth.get(id) ?? 0) / 2 + 1) / length : 0;
      const clipped = clipSegment(x0, z0, x1, z1, bounds, trim(edge.from), 1 - trim(edge.to));
      if (!clipped) continue;
      const [t0, t1] = clipped;
      const at = (t: number): [number, number] => [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
      if (MAJOR.has(edge.highway) && edge.widthMetres >= 8) {
        const ox = -(z1 - z0) / length * 0.18, oz = (x1 - x0) / length * 0.18;
        const [ax, az] = at(t0), [bx, bz] = at(t1);
        yellow.push([ax + ox, az + oz, bx + ox, bz + oz], [ax - ox, az - oz, bx - ox, bz - oz]);
        continue;
      }
      const s0 = start + t0 * length, s1 = start + t1 * length;
      for (let dash = Math.floor(s0 / DASH_PERIOD) * DASH_PERIOD; dash < s1; dash += DASH_PERIOD) {
        const d0 = Math.max(dash, s0), d1 = Math.min(dash + DASH, s1);
        if (d1 - d0 < 0.3) continue;
        const [ax, az] = at((d0 - start) / length), [bx, bz] = at((d1 - start) / length);
        white.push([ax, az, bx, bz]);
      }
    }
  }
  return { yellow, white };
}

/** Liang–Barsky clip of the parameter range [t0, t1] to the horizontal zone bounds. */
function clipSegment(x0: number, z0: number, x1: number, z1: number, bounds: ZoneBounds3d, t0: number, t1: number): [number, number] | undefined {
  const dx = x1 - x0, dz = z1 - z0;
  for (const [p, q] of [[-dx, x0 - bounds.minimumX], [dx, bounds.maximumX - x0], [-dz, z0 - bounds.minimumZ], [dz, bounds.maximumZ - z0]]) {
    if (p === 0) { if (q < 0) return undefined; continue; }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
  }
  return t1 - t0 > 1e-6 ? [t0, t1] : undefined;
}
