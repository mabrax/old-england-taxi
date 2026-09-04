import { describe, expect, it } from 'vitest';
import {
  compileLocalCoordinates,
  createLocalCoordinateTransform
} from '../tools/zone-compiler/src/local-coordinates';
import { loadZoneSource } from '../tools/zone-compiler/src/load-zone-source';
import type {
  GeographicCoordinate,
  LocalPosition,
  OsmNode,
  OsmWay
} from '../tools/zone-compiler/src/types';

const DISTANCE_TOLERANCE_METRES = 0.05;

describe.sequential('local zone coordinates', () => {
  it('transforms every OSM node and way while preserving source topology', async () => {
    const source = await loadZoneSource();
    const local = compileLocalCoordinates(source);
    const sourceNodes = source.osm.elements.filter(
      (element): element is OsmNode => element.type === 'node'
    );
    const sourceWays = source.osm.elements.filter(
      (element): element is OsmWay => element.type === 'way'
    );
    const pointById = new Map(local.points.map((point) => [point.id, point]));

    expect(local.points).toHaveLength(source.counts.nodes);
    expect(local.lines).toHaveLength(source.counts.ways);
    expect(local.points.map((point) => point.id)).toEqual(sourceNodes.map((node) => node.id));
    expect(local.lines.map((line) => line.id)).toEqual(sourceWays.map((way) => way.id));
    expect(local.points.every((point) => isFinitePosition(point.position))).toBe(true);
    expect(
      local.lines.every((line, index) => {
        const sourceWay = sourceWays[index];
        return (
          sourceWay !== undefined &&
          line.positions.length === sourceWay.nodes.length &&
          line.nodeIds.every((nodeId, nodeIndex) => nodeId === sourceWay.nodes[nodeIndex]) &&
          line.positions.every((position, nodeIndex) => {
            const point = pointById.get(line.nodeIds[nodeIndex] as number);
            return point !== undefined && positionsAreEqual(position, point.position);
          }) &&
          line.closed ===
            (sourceWay.nodes[0] === sourceWay.nodes[sourceWay.nodes.length - 1]) &&
          line.positions.every(isFinitePosition)
        );
      })
    ).toBe(true);

    const taggedNode = sourceNodes.find((node) => node.tags !== undefined);
    const highway = sourceWays.find((way) => way.tags?.highway !== undefined);
    const building = sourceWays.find((way) => way.tags?.building !== undefined);

    expect(pointById.get(taggedNode?.id as number)?.tags).toEqual(taggedNode?.tags);
    expect(local.lines.find((line) => line.id === highway?.id)?.tags).toEqual(highway?.tags);
    expect(local.lines.find((line) => line.id === building?.id)?.tags).toEqual(building?.tags);
  });

  it('retains one explicit origin and right-handed axis convention in zone metadata', async () => {
    const source = await loadZoneSource();
    const local = compileLocalCoordinates(source);

    expect(local.metadata).toEqual({
      slug: 'trafalgar-square-london',
      label: 'Trafalgar Square, London',
      sourceBounds: source.manifest.bounds,
      coordinateSystem: {
        schemaVersion: 1,
        sourceCrs: 'EPSG:4326',
        method: 'wgs84-local-tangent-plane',
        units: 'metres',
        origin: {
          latitude: 51.50803,
          longitude: -0.1281,
          ellipsoidHeightMetres: 0
        },
        axes: {
          handedness: 'right',
          x: 'east',
          y: 'up',
          z: 'south'
        },
        groundPlaneY: 0
      }
    });
  });

  it('maps east and south to positive local axes and keeps the source on the ground plane', async () => {
    const { manifest } = await loadZoneSource();
    const transform = createLocalCoordinateTransform(manifest.bounds);
    const { latitude, longitude } = transform.metadata.origin;
    const origin = transform.project({ latitude, longitude });
    const east = transform.project({ latitude, longitude: longitude + 0.001 });
    const west = transform.project({ latitude, longitude: longitude - 0.001 });
    const north = transform.project({ latitude: latitude + 0.001, longitude });
    const south = transform.project({ latitude: latitude - 0.001, longitude });

    expect(origin).toEqual({ x: 0, y: 0, z: 0 });
    expect(east.x).toBeGreaterThan(0);
    expect(west.x).toBeLessThan(0);
    expect(north.z).toBeLessThan(0);
    expect(south.z).toBeGreaterThan(0);
    expect(Math.abs(east.x)).toBeGreaterThan(Math.abs(east.z) * 10_000);
    expect(Math.abs(north.z)).toBeGreaterThan(Math.abs(north.x) * 10_000);
    expect([origin, east, west, north, south].every((point) => point.y === 0)).toBe(true);
  });

  it('produces byte-stable coordinates when the same source is transformed repeatedly', async () => {
    const source = await loadZoneSource();
    const first = JSON.stringify(compileLocalCoordinates(source));
    const second = JSON.stringify(compileLocalCoordinates(source));

    expect(second).toBe(first);
  });

  it('preserves WGS84 distances across every source line within five centimetres', async () => {
    const source = await loadZoneSource();
    const local = compileLocalCoordinates(source);
    const sourceNodeById = new Map(
      source.osm.elements
        .filter((element): element is OsmNode => element.type === 'node')
        .map((node) => [node.id, node])
    );
    let maximumErrorMetres = 0;

    for (const line of local.lines) {
      for (let index = 1; index < line.nodeIds.length; index += 1) {
        const firstNode = sourceNodeById.get(line.nodeIds[index - 1] as number);
        const secondNode = sourceNodeById.get(line.nodeIds[index] as number);
        const firstPosition = line.positions[index - 1];
        const secondPosition = line.positions[index];
        if (
          firstNode === undefined ||
          secondNode === undefined ||
          firstPosition === undefined ||
          secondPosition === undefined
        ) {
          throw new Error(`Line ${line.id} contains an unresolved test position`);
        }

        const geographicDistance = vincentyDistanceMetres(
          { latitude: firstNode.lat, longitude: firstNode.lon },
          { latitude: secondNode.lat, longitude: secondNode.lon }
        );
        const localDistance = horizontalDistance(firstPosition, secondPosition);
        maximumErrorMetres = Math.max(
          maximumErrorMetres,
          Math.abs(localDistance - geographicDistance)
        );
      }
    }

    expect(maximumErrorMetres).toBeLessThanOrEqual(DISTANCE_TOLERANCE_METRES);
  });

  it('rejects coordinates that could produce ambiguous or non-finite output', async () => {
    const { manifest } = await loadZoneSource();
    const transform = createLocalCoordinateTransform(manifest.bounds);

    expect(() =>
      transform.project({ latitude: Number.NaN, longitude: 0 })
    ).toThrow('must contain finite latitude and longitude');
    expect(() =>
      transform.project({ latitude: 0, longitude: Number.POSITIVE_INFINITY })
    ).toThrow('must contain finite latitude and longitude');
    expect(() => transform.project({ latitude: 91, longitude: 0 })).toThrow(
      'outside WGS84 latitude or longitude limits'
    );
  });
});

function positionsAreEqual(first: LocalPosition, second: LocalPosition): boolean {
  return first.x === second.x && first.y === second.y && first.z === second.z;
}

function isFinitePosition(position: LocalPosition): boolean {
  return (
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    Number.isFinite(position.z)
  );
}

function horizontalDistance(first: LocalPosition, second: LocalPosition): number {
  return Math.hypot(second.x - first.x, second.z - first.z);
}

function vincentyDistanceMetres(
  first: GeographicCoordinate,
  second: GeographicCoordinate
): number {
  const semiMajorAxis = 6_378_137;
  const flattening = 1 / 298.257_223_563;
  const semiMinorAxis = (1 - flattening) * semiMajorAxis;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const longitudeDifference = radians(second.longitude - first.longitude);
  const reducedLatitude1 = Math.atan((1 - flattening) * Math.tan(radians(first.latitude)));
  const reducedLatitude2 = Math.atan((1 - flattening) * Math.tan(radians(second.latitude)));
  const sinReducedLatitude1 = Math.sin(reducedLatitude1);
  const cosReducedLatitude1 = Math.cos(reducedLatitude1);
  const sinReducedLatitude2 = Math.sin(reducedLatitude2);
  const cosReducedLatitude2 = Math.cos(reducedLatitude2);
  let lambda = longitudeDifference;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let sinAlpha = 0;
  let cosSquaredAlpha = 0;
  let cosTwoSigmaMidpoint = 0;

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    const firstTerm = cosReducedLatitude2 * sinLambda;
    const secondTerm =
      cosReducedLatitude1 * sinReducedLatitude2 -
      sinReducedLatitude1 * cosReducedLatitude2 * cosLambda;
    sinSigma = Math.hypot(firstTerm, secondTerm);
    if (sinSigma === 0) return 0;

    cosSigma =
      sinReducedLatitude1 * sinReducedLatitude2 +
      cosReducedLatitude1 * cosReducedLatitude2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha =
      (cosReducedLatitude1 * cosReducedLatitude2 * sinLambda) / sinSigma;
    cosSquaredAlpha = 1 - sinAlpha * sinAlpha;
    cosTwoSigmaMidpoint =
      cosSquaredAlpha === 0
        ? 0
        : cosSigma -
          (2 * sinReducedLatitude1 * sinReducedLatitude2) / cosSquaredAlpha;
    const correction =
      (flattening / 16) *
      cosSquaredAlpha *
      (4 + flattening * (4 - 3 * cosSquaredAlpha));
    const nextLambda =
      longitudeDifference +
      (1 - correction) *
        flattening *
        sinAlpha *
        (sigma +
          correction *
            sinSigma *
            (cosTwoSigmaMidpoint +
              correction *
                cosSigma *
                (-1 + 2 * cosTwoSigmaMidpoint * cosTwoSigmaMidpoint)));

    if (Math.abs(nextLambda - lambda) <= 1e-12) {
      lambda = nextLambda;
      break;
    }
    lambda = nextLambda;

    if (iteration === 99) {
      throw new Error('Vincenty distance did not converge');
    }
  }

  const uSquared =
    (cosSquaredAlpha *
      (semiMajorAxis * semiMajorAxis - semiMinorAxis * semiMinorAxis)) /
    (semiMinorAxis * semiMinorAxis);
  const coefficientA =
    1 +
    (uSquared / 16_384) *
      (4_096 + uSquared * (-768 + uSquared * (320 - 175 * uSquared)));
  const coefficientB =
    (uSquared / 1_024) *
    (256 + uSquared * (-128 + uSquared * (74 - 47 * uSquared)));
  const sigmaCorrection =
    coefficientB *
    sinSigma *
    (cosTwoSigmaMidpoint +
      (coefficientB / 4) *
        (cosSigma * (-1 + 2 * cosTwoSigmaMidpoint * cosTwoSigmaMidpoint) -
          (coefficientB / 6) *
            cosTwoSigmaMidpoint *
            (-3 + 4 * sinSigma * sinSigma) *
            (-3 + 4 * cosTwoSigmaMidpoint * cosTwoSigmaMidpoint)));

  return semiMinorAxis * coefficientA * (sigma - sigmaCorrection);
}
