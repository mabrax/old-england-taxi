import { UnsupportedBuildingGeometryError } from './building-geometry-error';
import type { BuildingFootprintPoint as Point } from './types';

const TOLERANCE = 1e-9;

interface Edge {
  start: Point;
  end: Point;
  index: number;
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
}

/** Earcut's area deviation alone cannot establish that a footprint is simple. */
export function validateSimpleRing(points: Point[], description: string): void {
  const seen = new Set<string>();
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
      throw new Error(`${description} has non-finite coordinates`);
    }
    if (Math.hypot(next.x - point.x, next.z - point.z) <= TOLERANCE) {
      throw new UnsupportedBuildingGeometryError(`${description} contains a zero-length edge at ${index}`);
    }
    const key = `${point.x}:${point.z}`;
    if (seen.has(key)) throw new UnsupportedBuildingGeometryError(`${description} repeats a boundary point at ${index}`);
    seen.add(key);
    const previous = points[(index + points.length - 1) % points.length];
    if (Math.abs(orientation(previous, point, next)) <= TOLERANCE &&
        (previous.x - point.x) * (next.x - point.x) +
        (previous.z - point.z) * (next.z - point.z) > 0) {
      throw new UnsupportedBuildingGeometryError(`${description} backtracks at boundary point ${index}`);
    }
  }
  const edges = ringEdges(points);
  for (let first = 0; first < edges.length; first += 1) {
    for (let second = first + 1; second < edges.length; second += 1) {
      const a = edges[first];
      const b = edges[second];
      if (b.minimumX > a.maximumX + TOLERANCE) break;
      const distance = Math.abs(a.index - b.index);
      if (distance === 1 || distance === points.length - 1) continue;
      if (edgesIntersect(a, b)) {
        throw new UnsupportedBuildingGeometryError(`${description} self-intersects at edges ${a.index} and ${b.index}`);
      }
    }
  }
}

export function ringsIntersect(first: Point[], second: Point[]): boolean {
  const firstEdges = ringEdges(first);
  const secondEdges = ringEdges(second);
  for (const a of firstEdges) {
    for (const b of secondEdges) {
      if (b.minimumX > a.maximumX + TOLERANCE) break;
      if (edgesIntersect(a, b)) return true;
    }
  }
  return false;
}

/** Call after excluding boundary intersections, so containment is unambiguous. */
export function pointInRing(point: Point, ring: Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index];
    const before = ring[previous];
    if (current.z > point.z !== before.z > point.z &&
        point.x < ((before.x - current.x) * (point.z - current.z)) /
          (before.z - current.z) + current.x) inside = !inside;
  }
  return inside;
}

function ringEdges(points: Point[]): Edge[] {
  return points.map((start, index) => {
    const end = points[(index + 1) % points.length];
    return {
      start, end, index,
      minimumX: Math.min(start.x, end.x), maximumX: Math.max(start.x, end.x),
      minimumZ: Math.min(start.z, end.z), maximumZ: Math.max(start.z, end.z)
    };
  }).sort((first, second) => first.minimumX - second.minimumX || first.index - second.index);
}

function edgesIntersect(a: Edge, b: Edge): boolean {
  if (a.maximumX < b.minimumX - TOLERANCE || b.maximumX < a.minimumX - TOLERANCE ||
      a.maximumZ < b.minimumZ - TOLERANCE || b.maximumZ < a.minimumZ - TOLERANCE) return false;
  const first = orientation(a.start, a.end, b.start);
  const second = orientation(a.start, a.end, b.end);
  const third = orientation(b.start, b.end, a.start);
  const fourth = orientation(b.start, b.end, a.end);
  if (((first > TOLERANCE && second < -TOLERANCE) || (first < -TOLERANCE && second > TOLERANCE)) &&
      ((third > TOLERANCE && fourth < -TOLERANCE) || (third < -TOLERANCE && fourth > TOLERANCE))) return true;
  return (Math.abs(first) <= TOLERANCE && pointOnEdge(b.start, a)) ||
    (Math.abs(second) <= TOLERANCE && pointOnEdge(b.end, a)) ||
    (Math.abs(third) <= TOLERANCE && pointOnEdge(a.start, b)) ||
    (Math.abs(fourth) <= TOLERANCE && pointOnEdge(a.end, b));
}

function pointOnEdge(point: Point, edge: Edge): boolean {
  return point.x >= edge.minimumX - TOLERANCE && point.x <= edge.maximumX + TOLERANCE &&
    point.z >= edge.minimumZ - TOLERANCE && point.z <= edge.maximumZ + TOLERANCE;
}

function orientation(start: Point, end: Point, point: Point): number {
  return (end.x - start.x) * (point.z - start.z) - (end.z - start.z) * (point.x - start.x);
}
