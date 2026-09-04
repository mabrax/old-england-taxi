import earcut, { deviation } from 'earcut';
import polygonClipping, {
  type MultiPolygon,
  type Pair,
  type Polygon,
  type Ring
} from 'polygon-clipping';
import { createLocalCoordinateTransform } from './local-coordinates';
import {
  ROAD_SURFACE_SCHEMA_VERSION,
  type CompiledRoadCenterline,
  type LocalCoordinateZone,
  type LocalLineFeature,
  type LocalPosition,
  type OsmTags,
  type RoadSurfacePoint,
  type RoadSurfacePolygon,
  type RoadSurfaceZone,
  type RoadWidthInference,
  type SupportedRoadHighway,
  type TriangulatedRoadMesh
} from './types';

export const ROAD_LANE_WIDTH_METRES = 3.2;
export const ROAD_BUFFER_CIRCLE_SEGMENTS = 12;
export const ROAD_GEOMETRY_INPUT_PRECISION_METRES = 0.001;

export const ROAD_FALLBACK_WIDTH_METRES: Record<SupportedRoadHighway, number> = {
  motorway: 12.8,
  motorway_link: 6.4,
  trunk: 12.8,
  trunk_link: 6.4,
  primary: 9.6,
  primary_link: 4.8,
  secondary: 8,
  secondary_link: 4.8,
  tertiary: 6.4,
  tertiary_link: 4.8,
  unclassified: 5.5,
  residential: 5.5,
  living_street: 4.8,
  service: 3.5,
  road: 5.5
};

export const SUPPORTED_ROAD_HIGHWAYS = Object.freeze(
  Object.keys(ROAD_FALLBACK_WIDTH_METRES) as SupportedRoadHighway[]
);

const WIDTH_PATTERN = /^(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?$/i;
const LANE_PATTERN = /^\d+$/;
const MINIMUM_WIDTH_METRES = 1;
const MAXIMUM_WIDTH_METRES = 50;
const MAXIMUM_LANES = 12;
const POSITION_TOLERANCE = 1e-9;
const TRIANGLE_AREA_TOLERANCE = 1e-10;
const OUTPUT_PRECISION_DECIMALS = 6;

export interface CompileRoadSurfaceOptions {
  clipToSourceBounds?: boolean;
}

interface TriangulationResult {
  positions: number[];
  indices: number[];
  deviation: number;
}

export function isSupportedRoad(tags: OsmTags | undefined): tags is OsmTags & {
  highway: SupportedRoadHighway;
} {
  return (
    tags?.area !== 'yes' &&
    SUPPORTED_ROAD_HIGHWAYS.includes(tags?.highway as SupportedRoadHighway)
  );
}

export function inferRoadWidth(
  tags: OsmTags & { highway: SupportedRoadHighway }
): RoadWidthInference {
  const taggedWidth = parseTaggedWidth(tags.width);
  if (taggedWidth !== undefined) {
    return {
      metres: taggedWidth,
      source: 'width',
      sourceValue: tags.width as string
    };
  }

  const lanes = parseLaneCount(tags.lanes);
  if (lanes !== undefined) {
    return {
      metres: roundOutput(lanes * ROAD_LANE_WIDTH_METRES),
      source: 'lanes',
      sourceValue: tags.lanes as string
    };
  }

  const fallback = ROAD_FALLBACK_WIDTH_METRES[tags.highway];
  return {
    metres: fallback,
    source: 'highway-default',
    sourceValue: tags.highway
  };
}

export function compileRoadSurfaces(
  local: LocalCoordinateZone,
  options: CompileRoadSurfaceOptions = {}
): RoadSurfaceZone {
  const clipToSourceBounds = options.clipToSourceBounds ?? true;
  const sourceBoundsRing = clipToSourceBounds
    ? createSourceBoundsRing(local)
    : undefined;
  const roads = local.lines
    .filter((line) => isSupportedRoad(line.tags))
    .sort((first, second) => first.id - second.id)
    .map((line) => compileCenterline(line, sourceBoundsRing));

  if (roads.length === 0) {
    throw new Error('The local zone contains no supported road centerlines');
  }

  const bufferPolygons: MultiPolygon = [];
  const contributingRoads: CompiledRoadCenterline[] = [];
  const diagnostics = { skippedOutsideRoads: 0, skippedOutsideSegments: 0, bufferedSegments: 0 };
  const bounds = sourceBoundsRing === undefined ? undefined : {
    minimumX: Math.min(...sourceBoundsRing.map(([x]) => x)),
    maximumX: Math.max(...sourceBoundsRing.map(([x]) => x)),
    minimumZ: Math.min(...sourceBoundsRing.map(([, z]) => z)),
    maximumZ: Math.max(...sourceBoundsRing.map(([, z]) => z))
  };

  for (const road of roads) {
    const radius = road.width.metres / 2;
    const before = bufferPolygons.length;

    for (let index = 1; index < road.positions.length; index += 1) {
      const start = road.positions[index - 1];
      const end = road.positions[index];
      if (start === undefined || end === undefined) {
        throw new Error(`Road way/${road.id} has an unresolved segment`);
      }
      if (horizontalDistance(start, end) <= POSITION_TOLERANCE) {
        throw new Error(`Road way/${road.id} contains a zero-length segment at index ${index - 1}`);
      }
      // A conservative broad phase: include the buffer and rounding margin, not just
      // the centerline. Near-boundary pavement can contribute without a graph edge.
      const margin = radius + ROAD_GEOMETRY_INPUT_PRECISION_METRES;
      if (bounds !== undefined && (
        Math.max(start.x, end.x) + margin < bounds.minimumX ||
        Math.min(start.x, end.x) - margin > bounds.maximumX ||
        Math.max(start.z, end.z) + margin < bounds.minimumZ ||
        Math.min(start.z, end.z) - margin > bounds.maximumZ
      )) {
        diagnostics.skippedOutsideSegments += 1;
        continue;
      }
      bufferPolygons.push(createSegmentCapsule(start, end, radius));
    }
    if (bufferPolygons.length > before) contributingRoads.push(road);
    else diagnostics.skippedOutsideRoads += 1;
  }
  diagnostics.bufferedSegments = bufferPolygons.length;

  if (bufferPolygons.length === 0) {
    throw new Error('Road buffering produced no surface inside the source bounds');
  }
  let unioned = polygonClipping.union(bufferPolygons);
  if (sourceBoundsRing !== undefined) {
    unioned = polygonClipping.intersection(unioned, [sourceBoundsRing]);
  }
  if (unioned.length === 0) {
    throw new Error('Road buffering produced no surface inside the source bounds');
  }

  const polygons = normalisePolygons(unioned);
  const mesh = triangulateRoadPolygons(polygons);

  return {
    metadata: {
      schemaVersion: ROAD_SURFACE_SCHEMA_VERSION,
      slug: local.metadata.slug,
      label: local.metadata.label,
      sourceBounds: { ...local.metadata.sourceBounds },
      coordinateSystem: local.metadata.coordinateSystem,
      supportedHighways: [...SUPPORTED_ROAD_HIGHWAYS],
      widthRules: {
        precedence: ['width', 'lanes', 'highway-default'],
        laneWidthMetres: ROAD_LANE_WIDTH_METRES,
        fallbackWidthMetres: { ...ROAD_FALLBACK_WIDTH_METRES }
      },
      buffer: {
        cap: 'round',
        join: 'round',
        circleSegments: ROAD_BUFFER_CIRCLE_SEGMENTS,
        inputPrecisionMetres: ROAD_GEOMETRY_INPUT_PRECISION_METRES
      },
      clippedToSourceBounds: clipToSourceBounds
    },
    roads: contributingRoads,
    diagnostics,
    polygons,
    mesh
  };
}

export function triangulateRoadPolygons(
  polygons: RoadSurfacePolygon[]
): TriangulatedRoadMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  let maximumDeviation = 0;

  for (const [polygonIndex, polygon] of polygons.entries()) {
    const triangulated = triangulatePolygon(polygon, polygonIndex);
    const vertexOffset = positions.length / 3;
    for (const position of triangulated.positions) positions.push(position);
    for (const index of triangulated.indices) indices.push(index + vertexOffset);
    maximumDeviation = Math.max(maximumDeviation, triangulated.deviation);
  }

  if (positions.length === 0 || indices.length === 0) {
    throw new Error('Road polygons did not produce renderable triangles');
  }

  const meshArea = calculateMeshArea(positions, indices);
  const polygonArea = polygons.reduce(
    (total, polygon) => total + polygon.areaSquareMetres,
    0
  );
  const relativeAreaError = Math.abs(meshArea - polygonArea) / polygonArea;
  if (!Number.isFinite(relativeAreaError) || relativeAreaError > 1e-8) {
    throw new Error(
      `Road triangulation area mismatch: relative error ${relativeAreaError}`
    );
  }

  return {
    positions,
    indices,
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
    areaSquareMetres: roundOutput(meshArea),
    maximumDeviation
  };
}

function compileCenterline(
  line: LocalLineFeature,
  sourceBoundsRing: Ring | undefined
): CompiledRoadCenterline {
  if (!isSupportedRoad(line.tags)) {
    throw new Error(`Line way/${line.id} is not a supported road`);
  }
  if (line.positions.length !== line.nodeIds.length || line.positions.length < 2) {
    throw new Error(`Road way/${line.id} has invalid centerline topology`);
  }

  line.positions.forEach((position) =>
    validatePosition(position, `Road way/${line.id}`)
  );
  const width = inferRoadWidth(line.tags);
  const inZoneSegmentIndices: number[] = [];

  for (let index = 1; index < line.positions.length; index += 1) {
    const start = line.positions[index - 1];
    const end = line.positions[index];
    if (start === undefined || end === undefined) continue;
    if (
      sourceBoundsRing === undefined ||
      segmentIntersectsRing(start, end, sourceBoundsRing)
    ) {
      inZoneSegmentIndices.push(index - 1);
    }
  }

  return {
    id: line.id,
    highway: line.tags.highway,
    nodeIds: [...line.nodeIds],
    positions: line.positions.map((position) => ({ ...position })),
    width,
    segmentCount: line.positions.length - 1,
    inZoneSegmentIndices,
    inZoneSegmentCount: inZoneSegmentIndices.length
  };
}

function parseTaggedWidth(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = WIDTH_PATTERN.exec(value.trim());
  if (match === null) return undefined;
  const width = Number(match[1]);
  if (
    !Number.isFinite(width) ||
    width < MINIMUM_WIDTH_METRES ||
    width > MAXIMUM_WIDTH_METRES
  ) {
    return undefined;
  }
  return roundOutput(width);
}

function parseLaneCount(value: string | undefined): number | undefined {
  if (value === undefined || !LANE_PATTERN.test(value.trim())) return undefined;
  const lanes = Number(value);
  if (!Number.isSafeInteger(lanes) || lanes < 1 || lanes > MAXIMUM_LANES) {
    return undefined;
  }
  return lanes;
}

function createSegmentCapsule(
  start: LocalPosition,
  end: LocalPosition,
  radius: number
): Polygon {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const direction = Math.atan2(deltaZ, deltaX);
  const semicircleSegments = ROAD_BUFFER_CIRCLE_SEGMENTS / 2;
  const ring: Ring = [];

  for (let index = 0; index <= semicircleSegments; index += 1) {
    const angle = direction - Math.PI / 2 + (index / semicircleSegments) * Math.PI;
    ring.push(
      roundedPair(
        end.x + Math.cos(angle) * radius,
        end.z + Math.sin(angle) * radius
      )
    );
  }

  for (let index = 0; index <= semicircleSegments; index += 1) {
    const angle = direction + Math.PI / 2 + (index / semicircleSegments) * Math.PI;
    ring.push(
      roundedPair(
        start.x + Math.cos(angle) * radius,
        start.z + Math.sin(angle) * radius
      )
    );
  }

  return [ring];
}

function createSourceBoundsRing(local: LocalCoordinateZone): Ring {
  const bounds = local.metadata.sourceBounds;
  const transform = createLocalCoordinateTransform(bounds);
  const corners = [
    transform.project({ latitude: bounds.south, longitude: bounds.west }),
    transform.project({ latitude: bounds.south, longitude: bounds.east }),
    transform.project({ latitude: bounds.north, longitude: bounds.east }),
    transform.project({ latitude: bounds.north, longitude: bounds.west })
  ];
  return corners.map((corner) => roundedPair(corner.x, corner.z));
}

function normalisePolygons(multiPolygon: MultiPolygon): RoadSurfacePolygon[] {
  return multiPolygon.map((polygon, polygonIndex) => {
    const rings = polygon.map((ring, ringIndex) =>
      normaliseRing(ring, `Road polygon ${polygonIndex} ring ${ringIndex}`)
    );
    const areaSquareMetres = calculatePolygonArea(rings);
    if (
      !Number.isFinite(areaSquareMetres) ||
      areaSquareMetres <= TRIANGLE_AREA_TOLERANCE
    ) {
      throw new Error(`Road polygon ${polygonIndex} has invalid area`);
    }
    return {
      rings,
      areaSquareMetres
    };
  });
}

function normaliseRing(ring: Ring, description: string): RoadSurfacePoint[] {
  const points = ring.map(([x, z]) => ({
    // Triangulate in the precision used by Three.js position buffers. Rounding
    // only after triangulation can collapse or reverse thin boundary triangles.
    x: Math.fround(roundOutput(x)),
    z: Math.fround(roundOutput(z))
  }));
  if (
    points.length > 1 &&
    sameHorizontalPosition(
      points[0] as RoadSurfacePoint,
      points.at(-1) as RoadSurfacePoint
    )
  ) {
    points.pop();
  }

  const unique: RoadSurfacePoint[] = [];
  for (const point of points) {
    if (
      unique.length === 0 ||
      !sameHorizontalPosition(unique.at(-1) as RoadSurfacePoint, point)
    ) {
      unique.push(point);
    }
  }
  if (unique.length < 3) {
    throw new Error(`${description} contains fewer than three unique points`);
  }
  return unique;
}

function triangulatePolygon(
  polygon: RoadSurfacePolygon,
  polygonIndex: number
): TriangulationResult {
  const flat: number[] = [];
  const holes: number[] = [];

  polygon.rings.forEach((ring, ringIndex) => {
    if (ringIndex > 0) holes.push(flat.length / 2);
    for (const point of ring) flat.push(point.x, point.z);
  });

  const rawIndices = earcut(flat, holes, 2);
  const triangulationDeviation = deviation(flat, holes, 2, rawIndices);
  if (!Number.isFinite(triangulationDeviation) || triangulationDeviation > 1e-8) {
    throw new Error(
      `Road polygon ${polygonIndex} triangulated with deviation ${triangulationDeviation}`
    );
  }

  const positions: number[] = [];
  for (let index = 0; index < flat.length; index += 2) {
    positions.push(flat[index] as number, 0, flat[index + 1] as number);
  }

  const indices: number[] = [];
  for (let index = 0; index < rawIndices.length; index += 3) {
    const first = rawIndices[index];
    let second = rawIndices[index + 1];
    let third = rawIndices[index + 2];
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error(`Road polygon ${polygonIndex} produced an incomplete triangle`);
    }
    const normalY = triangleNormalY(positions, first, second, third);
    if (Math.abs(normalY) <= TRIANGLE_AREA_TOLERANCE) {
      throw new Error(`Road polygon ${polygonIndex} produced a degenerate triangle`);
    }
    if (normalY < 0) [second, third] = [third, second];
    indices.push(first, second, third);
  }

  if (indices.length === 0) {
    throw new Error(`Road polygon ${polygonIndex} produced no triangles`);
  }

  return {
    positions,
    indices,
    deviation: triangulationDeviation
  };
}

function calculatePolygonArea(rings: RoadSurfacePoint[][]): number {
  return rings.reduce((total, ring, index) => {
    const area = Math.abs(calculateRingSignedArea(ring));
    return index === 0 ? total + area : total - area;
  }, 0);
}

function calculateRingSignedArea(ring: RoadSurfacePoint[]): number {
  let twiceArea = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index] as RoadSurfacePoint;
    const next = ring[(index + 1) % ring.length] as RoadSurfacePoint;
    twiceArea += current.x * next.z - next.x * current.z;
  }
  return twiceArea / 2;
}

function calculateMeshArea(positions: number[], indices: number[]): number {
  let twiceArea = 0;
  for (let index = 0; index < indices.length; index += 3) {
    twiceArea += triangleNormalY(
      positions,
      indices[index] as number,
      indices[index + 1] as number,
      indices[index + 2] as number
    );
  }
  return twiceArea / 2;
}

function triangleNormalY(
  positions: number[],
  first: number,
  second: number,
  third: number
): number {
  const firstOffset = first * 3;
  const secondOffset = second * 3;
  const thirdOffset = third * 3;
  const firstX = positions[firstOffset] as number;
  const firstZ = positions[firstOffset + 2] as number;
  const secondX = positions[secondOffset] as number;
  const secondZ = positions[secondOffset + 2] as number;
  const thirdX = positions[thirdOffset] as number;
  const thirdZ = positions[thirdOffset + 2] as number;
  return (
    (secondZ - firstZ) * (thirdX - firstX) -
    (secondX - firstX) * (thirdZ - firstZ)
  );
}

function segmentIntersectsRing(
  start: LocalPosition,
  end: LocalPosition,
  ring: Ring
): boolean {
  const first = toSurfacePoint(start);
  const second = toSurfacePoint(end);
  if (pointInRing(first, ring) || pointInRing(second, ring)) return true;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index] as Pair;
    const next = ring[(index + 1) % ring.length] as Pair;
    if (
      segmentsIntersect(
        first,
        second,
        { x: current[0], z: current[1] },
        { x: next[0], z: next[1] }
      )
    ) {
      return true;
    }
  }
  return false;
}

function pointInRing(point: RoadSurfacePoint, ring: Ring): boolean {
  let inside = false;
  for (
    let currentIndex = 0, previousIndex = ring.length - 1;
    currentIndex < ring.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = ring[currentIndex] as Pair;
    const previous = ring[previousIndex] as Pair;
    const crosses =
      current[1] > point.z !== previous[1] > point.z &&
      point.x <
        ((previous[0] - current[0]) * (point.z - current[1])) /
          (previous[1] - current[1]) +
          current[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(
  firstStart: RoadSurfacePoint,
  firstEnd: RoadSurfacePoint,
  secondStart: RoadSurfacePoint,
  secondEnd: RoadSurfacePoint
): boolean {
  const orientation1 = orientation(firstStart, firstEnd, secondStart);
  const orientation2 = orientation(firstStart, firstEnd, secondEnd);
  const orientation3 = orientation(secondStart, secondEnd, firstStart);
  const orientation4 = orientation(secondStart, secondEnd, firstEnd);

  if (
    oppositeSigns(orientation1, orientation2) &&
    oppositeSigns(orientation3, orientation4)
  ) {
    return true;
  }
  if (
    Math.abs(orientation1) <= POSITION_TOLERANCE &&
    pointOnSegment(secondStart, firstStart, firstEnd)
  ) {
    return true;
  }
  if (
    Math.abs(orientation2) <= POSITION_TOLERANCE &&
    pointOnSegment(secondEnd, firstStart, firstEnd)
  ) {
    return true;
  }
  if (
    Math.abs(orientation3) <= POSITION_TOLERANCE &&
    pointOnSegment(firstStart, secondStart, secondEnd)
  ) {
    return true;
  }
  if (
    Math.abs(orientation4) <= POSITION_TOLERANCE &&
    pointOnSegment(firstEnd, secondStart, secondEnd)
  ) {
    return true;
  }
  return false;
}

function oppositeSigns(first: number, second: number): boolean {
  return (
    (first > POSITION_TOLERANCE && second < -POSITION_TOLERANCE) ||
    (first < -POSITION_TOLERANCE && second > POSITION_TOLERANCE)
  );
}

function pointOnSegment(
  point: RoadSurfacePoint,
  start: RoadSurfacePoint,
  end: RoadSurfacePoint
): boolean {
  return (
    point.x >= Math.min(start.x, end.x) - POSITION_TOLERANCE &&
    point.x <= Math.max(start.x, end.x) + POSITION_TOLERANCE &&
    point.z >= Math.min(start.z, end.z) - POSITION_TOLERANCE &&
    point.z <= Math.max(start.z, end.z) + POSITION_TOLERANCE
  );
}

function orientation(
  start: RoadSurfacePoint,
  end: RoadSurfacePoint,
  point: RoadSurfacePoint
): number {
  return (
    (end.x - start.x) * (point.z - start.z) -
    (end.z - start.z) * (point.x - start.x)
  );
}

function roundedPair(x: number, z: number): Pair {
  return [roundInput(x), roundInput(z)];
}

function roundInput(value: number): number {
  return (
    Math.round(value / ROAD_GEOMETRY_INPUT_PRECISION_METRES) *
    ROAD_GEOMETRY_INPUT_PRECISION_METRES
  );
}

function roundOutput(value: number): number {
  return Number(value.toFixed(OUTPUT_PRECISION_DECIMALS));
}

function sameHorizontalPosition(
  first: RoadSurfacePoint,
  second: RoadSurfacePoint | LocalPosition
): boolean {
  return (
    Math.abs(first.x - second.x) <= POSITION_TOLERANCE &&
    Math.abs(first.z - second.z) <= POSITION_TOLERANCE
  );
}

function toSurfacePoint(position: LocalPosition): RoadSurfacePoint {
  return { x: position.x, z: position.z };
}

function horizontalDistance(first: LocalPosition, second: LocalPosition): number {
  return Math.hypot(second.x - first.x, second.z - first.z);
}

function validatePosition(position: LocalPosition, description: string): void {
  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z) ||
    position.y !== 0
  ) {
    throw new Error(`${description} must contain finite ground-plane positions`);
  }
}
