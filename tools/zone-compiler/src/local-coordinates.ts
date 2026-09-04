import {
  LOCAL_COORDINATE_SCHEMA_VERSION,
  type GeographicBounds,
  type GeographicCoordinate,
  type LoadedZoneSource,
  type LocalCoordinateSystemMetadata,
  type LocalCoordinateZone,
  type LocalLineFeature,
  type LocalPointFeature,
  type LocalPosition,
  type OsmTags
} from './types';

const WGS84_SEMI_MAJOR_AXIS_METRES = 6_378_137;
const WGS84_FLATTENING = 1 / 298.257_223_563;
const WGS84_ECCENTRICITY_SQUARED =
  WGS84_FLATTENING * (2 - WGS84_FLATTENING);
const DEGREES_TO_RADIANS = Math.PI / 180;
const ZERO_TOLERANCE_METRES = 1e-9;

interface EarthCentredPosition {
  x: number;
  y: number;
  z: number;
}

export interface LocalCoordinateTransform {
  metadata: LocalCoordinateSystemMetadata;
  project: (coordinate: GeographicCoordinate) => LocalPosition;
}

export function createLocalCoordinateTransform(
  bounds: GeographicBounds
): LocalCoordinateTransform {
  validateBounds(bounds);

  const origin = {
    latitude: (bounds.south + bounds.north) / 2,
    longitude: (bounds.west + bounds.east) / 2,
    ellipsoidHeightMetres: 0 as const
  };
  const metadata: LocalCoordinateSystemMetadata = {
    schemaVersion: LOCAL_COORDINATE_SCHEMA_VERSION,
    sourceCrs: 'EPSG:4326',
    method: 'wgs84-local-tangent-plane',
    units: 'metres',
    origin,
    axes: {
      handedness: 'right',
      x: 'east',
      y: 'up',
      z: 'south'
    },
    groundPlaneY: 0
  };

  const originRadians = toRadians(origin);
  const originEarthCentred = toEarthCentredPosition(originRadians);
  const sinOriginLatitude = Math.sin(originRadians.latitude);
  const cosOriginLatitude = Math.cos(originRadians.latitude);
  const sinOriginLongitude = Math.sin(originRadians.longitude);
  const cosOriginLongitude = Math.cos(originRadians.longitude);

  return {
    metadata,
    project: (coordinate) => {
      validateCoordinate(coordinate, 'Geographic coordinate');

      const earthCentred = toEarthCentredPosition(toRadians(coordinate));
      const deltaX = earthCentred.x - originEarthCentred.x;
      const deltaY = earthCentred.y - originEarthCentred.y;
      const deltaZ = earthCentred.z - originEarthCentred.z;
      const east = -sinOriginLongitude * deltaX + cosOriginLongitude * deltaY;
      const north =
        -sinOriginLatitude * cosOriginLongitude * deltaX -
        sinOriginLatitude * sinOriginLongitude * deltaY +
        cosOriginLatitude * deltaZ;
      const position = {
        x: normaliseZero(east),
        y: 0,
        z: normaliseZero(-north)
      };

      if (!isFinitePosition(position)) {
        throw new Error('Coordinate transform produced a non-finite local position');
      }

      return position;
    }
  };
}

export function compileLocalCoordinates(source: LoadedZoneSource): LocalCoordinateZone {
  const transform = createLocalCoordinateTransform(source.manifest.bounds);
  const points: LocalPointFeature[] = [];
  const pointById = new Map<number, LocalPointFeature>();

  for (const element of source.osm.elements) {
    if (element.type !== 'node') continue;

    const point: LocalPointFeature = withOptionalTags(
      {
        type: 'point',
        id: element.id,
        position: transform.project({
          latitude: element.lat,
          longitude: element.lon
        })
      },
      element.tags
    );
    points.push(point);
    pointById.set(point.id, point);
  }

  const lines: LocalLineFeature[] = [];

  for (const element of source.osm.elements) {
    if (element.type !== 'way') continue;
    if (element.nodes.length < 2) {
      throw new Error(`Cannot transform way/${element.id}: a line requires at least two nodes`);
    }

    const positions = element.nodes.map((nodeId) => {
      const point = pointById.get(nodeId);
      if (point === undefined) {
        throw new Error(`Cannot transform way/${element.id}: missing node/${nodeId}`);
      }
      return { ...point.position };
    });

    lines.push(
      withOptionalTags(
        {
          type: 'line',
          id: element.id,
          nodeIds: [...element.nodes],
          positions,
          closed: element.nodes[0] === element.nodes[element.nodes.length - 1]
        },
        element.tags
      )
    );
  }

  return {
    metadata: {
      slug: source.manifest.slug,
      label: source.manifest.label,
      sourceBounds: { ...source.manifest.bounds },
      coordinateSystem: transform.metadata
    },
    points,
    lines
  };
}

function toRadians(coordinate: GeographicCoordinate): GeographicCoordinate {
  return {
    latitude: coordinate.latitude * DEGREES_TO_RADIANS,
    longitude: coordinate.longitude * DEGREES_TO_RADIANS
  };
}

function toEarthCentredPosition(
  coordinateRadians: GeographicCoordinate
): EarthCentredPosition {
  const sinLatitude = Math.sin(coordinateRadians.latitude);
  const cosLatitude = Math.cos(coordinateRadians.latitude);
  const primeVerticalRadius =
    WGS84_SEMI_MAJOR_AXIS_METRES /
    Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED * sinLatitude * sinLatitude);

  return {
    x:
      primeVerticalRadius *
      cosLatitude *
      Math.cos(coordinateRadians.longitude),
    y:
      primeVerticalRadius *
      cosLatitude *
      Math.sin(coordinateRadians.longitude),
    z: primeVerticalRadius * (1 - WGS84_ECCENTRICITY_SQUARED) * sinLatitude
  };
}

function validateBounds(bounds: GeographicBounds): void {
  validateCoordinate(
    { latitude: bounds.south, longitude: bounds.west },
    'Geographic south-west bound'
  );
  validateCoordinate(
    { latitude: bounds.north, longitude: bounds.east },
    'Geographic north-east bound'
  );
  if (bounds.south >= bounds.north || bounds.west >= bounds.east) {
    throw new Error('Geographic bounds must have increasing latitude and longitude');
  }
}

function validateCoordinate(coordinate: GeographicCoordinate, description: string): void {
  if (
    !Number.isFinite(coordinate.latitude) ||
    !Number.isFinite(coordinate.longitude)
  ) {
    throw new Error(`${description} must contain finite latitude and longitude`);
  }
  if (
    coordinate.latitude < -90 ||
    coordinate.latitude > 90 ||
    coordinate.longitude < -180 ||
    coordinate.longitude > 180
  ) {
    throw new Error(`${description} is outside WGS84 latitude or longitude limits`);
  }
}

function normaliseZero(value: number): number {
  return Math.abs(value) < ZERO_TOLERANCE_METRES ? 0 : value;
}

function isFinitePosition(position: LocalPosition): boolean {
  return (
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    Number.isFinite(position.z)
  );
}

function withOptionalTags<T extends object>(
  value: T,
  tags: OsmTags | undefined
): T & { tags?: OsmTags } {
  return tags === undefined ? value : { ...value, tags: { ...tags } };
}
