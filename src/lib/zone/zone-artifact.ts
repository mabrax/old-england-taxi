import {
  STREET_GRAPH_SCHEMA_VERSION,
  ZONE_ARTIFACT_SCHEMA_VERSION,
  type ZoneArtifact,
  type ZoneBounds3d
} from './types';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LENGTH_TOLERANCE_METRES = 1e-6;

export class ZoneArtifactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZoneArtifactValidationError';
  }
}

export function parseZoneArtifact(value: unknown): ZoneArtifact {
  const artifact = expectRecord(value, 'Zone artifact');
  expectLiteral(
    artifact.schemaVersion,
    ZONE_ARTIFACT_SCHEMA_VERSION,
    'Zone artifact schemaVersion'
  );
  expectMatchingString(artifact.slug, SLUG_PATTERN, 'Zone artifact slug');
  expectNonEmptyString(artifact.label, 'Zone artifact label');

  validateSource(expectRecord(artifact.source, 'Zone artifact source'));
  const localBounds = validateCoordinates(
    expectRecord(artifact.coordinates, 'Zone artifact coordinates')
  );
  const supportedHighways = validateCompiler(
    expectRecord(artifact.compiler, 'Zone artifact compiler')
  );
  const geometry = expectRecord(artifact.geometry, 'Zone artifact geometry');
  const roadGeometry = validateRoadGeometry(
    expectRecord(geometry.roads, 'Zone artifact road geometry')
  );
  const buildingBounds = validateBuildingGeometry(
    expectRecord(geometry.buildings, 'Zone artifact building geometry')
  );
  expectBoundsEqual(
    localBounds,
    unionBounds(roadGeometry.bounds, buildingBounds),
    'local bounds'
  );
  const graphEdgeCount = validateStreetGraph(
    expectRecord(artifact.streetGraph, 'Zone artifact street graph'),
    supportedHighways
  );
  expectLiteral(
    graphEdgeCount,
    roadGeometry.centerlineSegments,
    'Street graph edge and road centerline segment count'
  );

  return value as ZoneArtifact;
}

function validateSource(source: Record<string, unknown>): void {
  expectLiteral(source.schemaVersion, 1, 'Zone source schemaVersion');
  const bounds = expectRecord(source.bounds, 'Zone source bounds');
  const south = expectFiniteNumber(bounds.south, 'Zone source bounds south');
  const west = expectFiniteNumber(bounds.west, 'Zone source bounds west');
  const north = expectFiniteNumber(bounds.north, 'Zone source bounds north');
  const east = expectFiniteNumber(bounds.east, 'Zone source bounds east');
  if (south >= north || west >= east) {
    fail('Zone source bounds must have positive latitude and longitude spans');
  }
  expectPositiveNumber(
    source.approximateAreaSquareKilometres,
    'Zone source approximateAreaSquareKilometres'
  );

  const snapshot = expectRecord(source.snapshot, 'Zone source snapshot');
  expectNonEmptyString(snapshot.file, 'Zone source snapshot file');
  expectLiteral(snapshot.format, 'overpass-json', 'Zone source snapshot format');
  expectPositiveInteger(snapshot.byteLength, 'Zone source snapshot byteLength');
  expectMatchingString(snapshot.sha256, SHA256_PATTERN, 'Zone source snapshot sha256');
  expectIsoTimestamp(snapshot.osmBaseTimestamp, 'Zone source snapshot osmBaseTimestamp');

  const provenance = expectRecord(source.provenance, 'Zone source provenance');
  expectNonEmptyString(provenance.dataset, 'Zone source provenance dataset');
  expectNonEmptyString(provenance.api, 'Zone source provenance api');
  expectUrl(provenance.endpoint, 'Zone source provenance endpoint');
  const request = expectRecord(provenance.request, 'Zone source provenance request');
  expectLiteral(request.method, 'POST', 'Zone source request method');
  expectNonEmptyString(request.parameter, 'Zone source request parameter');
  expectNonEmptyString(request.query, 'Zone source request query');
  expectNonEmptyString(provenance.attribution, 'Zone source attribution');
  expectUrl(provenance.attributionUrl, 'Zone source attributionUrl');
  const licence = expectRecord(provenance.licence, 'Zone source licence');
  expectNonEmptyString(licence.id, 'Zone source licence id');
  expectUrl(licence.url, 'Zone source licence url');
}

function validateCoordinates(coordinates: Record<string, unknown>): ZoneBounds3d {
  const system = expectRecord(coordinates.system, 'Zone coordinate system');
  expectLiteral(system.schemaVersion, 1, 'Zone coordinate schemaVersion');
  expectLiteral(system.sourceCrs, 'EPSG:4326', 'Zone coordinate sourceCrs');
  expectLiteral(
    system.method,
    'wgs84-local-tangent-plane',
    'Zone coordinate method'
  );
  expectLiteral(system.units, 'metres', 'Zone coordinate units');
  const origin = expectRecord(system.origin, 'Zone coordinate origin');
  const latitude = expectFiniteNumber(origin.latitude, 'Zone coordinate origin latitude');
  const longitude = expectFiniteNumber(
    origin.longitude,
    'Zone coordinate origin longitude'
  );
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    fail('Zone coordinate origin is outside WGS84 latitude or longitude limits');
  }
  expectLiteral(
    origin.ellipsoidHeightMetres,
    0,
    'Zone coordinate origin ellipsoidHeightMetres'
  );
  const axes = expectRecord(system.axes, 'Zone coordinate axes');
  expectLiteral(axes.handedness, 'right', 'Zone coordinate handedness');
  expectLiteral(axes.x, 'east', 'Zone coordinate x axis');
  expectLiteral(axes.y, 'up', 'Zone coordinate y axis');
  expectLiteral(axes.z, 'south', 'Zone coordinate z axis');
  expectLiteral(system.groundPlaneY, 0, 'Zone coordinate groundPlaneY');
  return validateBounds3d(coordinates.localBounds, 'Zone local bounds');
}

function validateCompiler(compiler: Record<string, unknown>): Set<string> {
  expectLiteral(
    compiler.name,
    'old-england-taxi-zone-compiler',
    'Zone compiler name'
  );
  const versions = expectRecord(
    compiler.componentSchemaVersions,
    'Zone compiler componentSchemaVersions'
  );
  for (const component of [
    'source',
    'coordinates',
    'roadSurfaces',
    'buildingVolumes',
    'streetGraph'
  ]) {
    expectLiteral(versions[component], 1, `Zone compiler ${component} schema version`);
  }

  const roads = expectRecord(compiler.roadSurfaces, 'Zone compiler road surfaces');
  const supportedHighways = expectStringArray(
    roads.supportedHighways,
    'Zone compiler supportedHighways'
  );
  if (supportedHighways.length === 0 || new Set(supportedHighways).size !== supportedHighways.length) {
    fail('Zone compiler supportedHighways must be non-empty and unique');
  }
  const widthRules = expectRecord(roads.widthRules, 'Zone compiler road widthRules');
  expectLiteralArray(
    widthRules.precedence,
    ['width', 'lanes', 'highway-default'],
    'Zone compiler road width precedence'
  );
  expectPositiveNumber(widthRules.laneWidthMetres, 'Zone compiler laneWidthMetres');
  const fallbackWidths = expectRecord(
    widthRules.fallbackWidthMetres,
    'Zone compiler fallbackWidthMetres'
  );
  for (const highway of supportedHighways) {
    expectPositiveNumber(
      fallbackWidths[highway],
      `Zone compiler fallback width for ${highway}`
    );
  }
  const buffer = expectRecord(roads.buffer, 'Zone compiler road buffer');
  expectLiteral(buffer.cap, 'round', 'Zone compiler road buffer cap');
  expectLiteral(buffer.join, 'round', 'Zone compiler road buffer join');
  expectPositiveInteger(buffer.circleSegments, 'Zone compiler road circleSegments');
  expectPositiveNumber(
    buffer.inputPrecisionMetres,
    'Zone compiler road inputPrecisionMetres'
  );
  expectLiteral(
    roads.clippedToSourceBounds,
    true,
    'Zone compiler roads clippedToSourceBounds'
  );

  const buildings = expectRecord(
    compiler.buildingVolumes,
    'Zone compiler building volumes'
  );
  const footprints = expectRecord(
    buildings.supportedFootprints,
    'Zone compiler supported building footprints'
  );
  expectLiteral(footprints.ways, 'closed-building-ways', 'Zone compiler building ways');
  expectLiteral(
    footprints.relations,
    'way-member-building-multipolygons',
    'Zone compiler building relations'
  );
  expectLiteral(
    footprints.buildingParts,
    'excluded',
    'Zone compiler building parts'
  );
  const heightRules = expectRecord(
    buildings.heightRules,
    'Zone compiler building heightRules'
  );
  expectLiteralArray(
    heightRules.precedence,
    ['height', 'building:levels', 'fallback'],
    'Zone compiler building height precedence'
  );
  for (const field of [
    'minimumHeightMetres',
    'maximumHeightMetres',
    'minimumLevels',
    'maximumLevels',
    'levelHeightMetres',
    'fallbackHeightMetres'
  ]) {
    expectPositiveNumber(heightRules[field], `Zone compiler building ${field}`);
  }
  expectLiteral(buildings.groundPlaneY, 0, 'Zone compiler building groundPlaneY');
  return new Set(supportedHighways);
}

function validateRoadGeometry(geometry: Record<string, unknown>): {
  bounds: ZoneBounds3d;
  centerlineSegments: number;
} {
  const { bounds, positions, indices } = validateIndexedGeometry(
    geometry,
    'Zone artifact road geometry'
  );
  const statistics = expectRecord(
    geometry.statistics,
    'Zone artifact road geometry statistics'
  );
  expectPositiveInteger(statistics.roadFeatures, 'Road geometry roadFeatures');
  const centerlineSegments = expectPositiveInteger(
    statistics.centerlineSegments,
    'Road geometry centerlineSegments'
  );
  expectPositiveInteger(statistics.surfacePolygons, 'Road geometry surfacePolygons');
  expectLiteral(statistics.vertices, positions.length / 3, 'Road geometry vertices');
  expectLiteral(statistics.triangles, indices.length / 3, 'Road geometry triangles');
  return { bounds, centerlineSegments };
}

function validateBuildingGeometry(geometry: Record<string, unknown>): ZoneBounds3d {
  const { bounds, positions, indices } = validateIndexedGeometry(
    geometry,
    'Zone artifact building geometry'
  );
  const statistics = expectRecord(
    geometry.statistics,
    'Zone artifact building geometry statistics'
  );
  const buildings = expectPositiveInteger(statistics.buildings, 'Building geometry buildings');
  const wayFootprints = expectNonNegativeInteger(
    statistics.wayFootprints,
    'Building geometry wayFootprints'
  );
  const relationFootprints = expectNonNegativeInteger(
    statistics.relationFootprints,
    'Building geometry relationFootprints'
  );
  expectLiteral(
    wayFootprints + relationFootprints,
    buildings,
    'Building geometry footprint count'
  );
  expectNonNegativeInteger(statistics.holes, 'Building geometry holes');
  expectLiteral(statistics.vertices, positions.length / 3, 'Building geometry vertices');
  expectLiteral(statistics.triangles, indices.length / 3, 'Building geometry triangles');
  return bounds;
}

function validateIndexedGeometry(
  geometry: Record<string, unknown>,
  description: string
): {
  bounds: ZoneBounds3d;
  positions: number[];
  indices: number[];
} {
  expectLiteral(geometry.primitive, 'triangles', `${description} primitive`);
  const positions = expectNumberArray(geometry.positions, `${description} positions`);
  const indices = expectIntegerArray(geometry.indices, `${description} indices`);
  if (positions.length === 0 || positions.length % 3 !== 0) {
    fail(`${description} positions must contain complete xyz vertices`);
  }
  if (indices.length === 0 || indices.length % 3 !== 0) {
    fail(`${description} indices must contain complete triangles`);
  }
  const vertexCount = positions.length / 3;
  for (const [index, vertexIndex] of indices.entries()) {
    if (vertexIndex < 0 || vertexIndex >= vertexCount) {
      fail(`${description} indices[${index}] is outside the vertex array`);
    }
  }
  const bounds = validateBounds3d(geometry.bounds, `${description} bounds`);
  expectBoundsEqual(bounds, calculateBounds(positions), `${description} bounds`);
  return { bounds, positions, indices };
}

function validateStreetGraph(
  graph: Record<string, unknown>,
  supportedHighways: Set<string>
): number {
  expectLiteral(
    graph.schemaVersion,
    STREET_GRAPH_SCHEMA_VERSION,
    'Street graph schemaVersion'
  );
  expectLiteral(graph.kind, 'undirected', 'Street graph kind');
  expectLiteral(
    graph.basis,
    'osm-road-centerline-segments-intersecting-source-bounds',
    'Street graph basis'
  );
  const rawNodes = expectArray(graph.nodes, 'Street graph nodes');
  const nodes = new Map<number, [number, number, number]>();
  let previousNodeId = -Infinity;
  for (const [index, rawNode] of rawNodes.entries()) {
    const node = expectRecord(rawNode, `Street graph nodes[${index}]`);
    const id = expectPositiveInteger(node.id, `Street graph nodes[${index}].id`);
    if (id <= previousNodeId) {
      fail('Street graph nodes must be ordered by unique ascending OSM node id');
    }
    previousNodeId = id;
    const position = expectFixedNumberArray(
      node.position,
      3,
      `Street graph nodes[${index}].position`
    ) as [number, number, number];
    if (position[1] !== 0) {
      fail(`Street graph nodes[${index}] must lie on the coordinate ground plane`);
    }
    nodes.set(id, position);
  }
  if (nodes.size === 0) fail('Street graph must contain nodes');

  const rawEdges = expectArray(graph.edges, 'Street graph edges');
  const edgeIds = new Set<string>();
  const usedNodeIds = new Set<number>();
  const adjacency = new Map<number, Set<number>>(
    [...nodes.keys()].map((nodeId) => [nodeId, new Set<number>()])
  );
  let previousWayId = -Infinity;
  let previousSegmentIndex = -Infinity;
  let totalLengthMetres = 0;
  for (const [index, rawEdge] of rawEdges.entries()) {
    const edge = expectRecord(rawEdge, `Street graph edges[${index}]`);
    const sourceWayId = expectPositiveInteger(
      edge.sourceWayId,
      `Street graph edges[${index}].sourceWayId`
    );
    const sourceSegmentIndex = expectNonNegativeInteger(
      edge.sourceSegmentIndex,
      `Street graph edges[${index}].sourceSegmentIndex`
    );
    if (
      sourceWayId < previousWayId ||
      (sourceWayId === previousWayId && sourceSegmentIndex <= previousSegmentIndex)
    ) {
      fail('Street graph edges must be ordered by unique way and segment index');
    }
    previousWayId = sourceWayId;
    previousSegmentIndex = sourceSegmentIndex;
    const id = expectNonEmptyString(edge.id, `Street graph edges[${index}].id`);
    if (id !== `${sourceWayId}:${sourceSegmentIndex}` || edgeIds.has(id)) {
      fail(`Street graph edges[${index}] has an invalid or duplicate id`);
    }
    edgeIds.add(id);
    const from = expectPositiveInteger(edge.from, `Street graph edges[${index}].from`);
    const to = expectPositiveInteger(edge.to, `Street graph edges[${index}].to`);
    const fromPosition = nodes.get(from);
    const toPosition = nodes.get(to);
    if (fromPosition === undefined || toPosition === undefined || from === to) {
      fail(`Street graph edges[${index}] has invalid endpoints`);
    }
    const highway = expectNonEmptyString(
      edge.highway,
      `Street graph edges[${index}].highway`
    );
    if (!supportedHighways.has(highway)) {
      fail(`Street graph edges[${index}] uses unsupported highway ${highway}`);
    }
    expectPositiveNumber(edge.widthMetres, `Street graph edges[${index}].widthMetres`);
    const lengthMetres = expectPositiveNumber(
      edge.lengthMetres,
      `Street graph edges[${index}].lengthMetres`
    );
    const expectedLength = roundOutput(
      Math.hypot(toPosition[0] - fromPosition[0], toPosition[2] - fromPosition[2])
    );
    if (Math.abs(lengthMetres - expectedLength) > LENGTH_TOLERANCE_METRES) {
      fail(`Street graph edges[${index}] length does not match its node positions`);
    }
    totalLengthMetres += lengthMetres;
    usedNodeIds.add(from);
    usedNodeIds.add(to);
    adjacency.get(from)?.add(to);
    adjacency.get(to)?.add(from);
  }
  if (rawEdges.length === 0) fail('Street graph must contain edges');
  if (usedNodeIds.size !== nodes.size) fail('Street graph contains an isolated node');

  const statistics = expectRecord(graph.statistics, 'Street graph statistics');
  expectLiteral(statistics.nodes, nodes.size, 'Street graph statistics nodes');
  expectLiteral(statistics.edges, rawEdges.length, 'Street graph statistics edges');
  expectLiteral(
    statistics.connectedComponents,
    countConnectedComponents(adjacency),
    'Street graph statistics connectedComponents'
  );
  expectLiteral(
    statistics.totalLengthMetres,
    roundOutput(totalLengthMetres),
    'Street graph statistics totalLengthMetres'
  );
  return rawEdges.length;
}

function validateBounds3d(value: unknown, description: string): ZoneBounds3d {
  const bounds = expectRecord(value, description);
  const parsed = {
    minimumX: expectFiniteNumber(bounds.minimumX, `${description} minimumX`),
    maximumX: expectFiniteNumber(bounds.maximumX, `${description} maximumX`),
    minimumY: expectFiniteNumber(bounds.minimumY, `${description} minimumY`),
    maximumY: expectFiniteNumber(bounds.maximumY, `${description} maximumY`),
    minimumZ: expectFiniteNumber(bounds.minimumZ, `${description} minimumZ`),
    maximumZ: expectFiniteNumber(bounds.maximumZ, `${description} maximumZ`)
  };
  if (
    parsed.minimumX > parsed.maximumX ||
    parsed.minimumY > parsed.maximumY ||
    parsed.minimumZ > parsed.maximumZ
  ) {
    fail(`${description} has an inverted axis`);
  }
  return parsed;
}

function calculateBounds(positions: number[]): ZoneBounds3d {
  const bounds: ZoneBounds3d = {
    minimumX: Infinity,
    maximumX: -Infinity,
    minimumY: Infinity,
    maximumY: -Infinity,
    minimumZ: Infinity,
    maximumZ: -Infinity
  };
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index] as number;
    const y = positions[index + 1] as number;
    const z = positions[index + 2] as number;
    bounds.minimumX = Math.min(bounds.minimumX, x);
    bounds.maximumX = Math.max(bounds.maximumX, x);
    bounds.minimumY = Math.min(bounds.minimumY, y);
    bounds.maximumY = Math.max(bounds.maximumY, y);
    bounds.minimumZ = Math.min(bounds.minimumZ, z);
    bounds.maximumZ = Math.max(bounds.maximumZ, z);
  }
  return bounds;
}

function unionBounds(first: ZoneBounds3d, second: ZoneBounds3d): ZoneBounds3d {
  return {
    minimumX: Math.min(first.minimumX, second.minimumX),
    maximumX: Math.max(first.maximumX, second.maximumX),
    minimumY: Math.min(first.minimumY, second.minimumY),
    maximumY: Math.max(first.maximumY, second.maximumY),
    minimumZ: Math.min(first.minimumZ, second.minimumZ),
    maximumZ: Math.max(first.maximumZ, second.maximumZ)
  };
}

function expectBoundsEqual(
  actual: ZoneBounds3d,
  expected: ZoneBounds3d,
  description: string
): void {
  for (const key of Object.keys(expected) as Array<keyof ZoneBounds3d>) {
    if (actual[key] !== expected[key]) {
      fail(`${description} ${key} does not match the geometry`);
    }
  }
}

function countConnectedComponents(adjacency: Map<number, Set<number>>): number {
  const visited = new Set<number>();
  let components = 0;
  for (const nodeId of adjacency.keys()) {
    if (visited.has(nodeId)) continue;
    components += 1;
    const pending = [nodeId];
    while (pending.length > 0) {
      const current = pending.pop() as number;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const neighbour of adjacency.get(current) ?? []) {
        if (!visited.has(neighbour)) pending.push(neighbour);
      }
    }
  }
  return components;
}

function expectRecord(value: unknown, description: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${description} must be an object`);
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, description: string): unknown[] {
  if (!Array.isArray(value)) fail(`${description} must be an array`);
  return value;
}

function expectNumberArray(value: unknown, description: string): number[] {
  const values = expectArray(value, description);
  values.forEach((item, index) =>
    expectFiniteNumber(item, `${description}[${index}]`)
  );
  return values as number[];
}

function expectIntegerArray(value: unknown, description: string): number[] {
  const values = expectArray(value, description);
  values.forEach((item, index) =>
    expectNonNegativeInteger(item, `${description}[${index}]`)
  );
  return values as number[];
}

function expectFixedNumberArray(
  value: unknown,
  length: number,
  description: string
): number[] {
  const values = expectNumberArray(value, description);
  if (values.length !== length) fail(`${description} must contain ${length} numbers`);
  return values;
}

function expectStringArray(value: unknown, description: string): string[] {
  const values = expectArray(value, description);
  values.forEach((item, index) =>
    expectNonEmptyString(item, `${description}[${index}]`)
  );
  return values as string[];
}

function expectLiteralArray(
  value: unknown,
  expected: readonly unknown[],
  description: string
): void {
  const values = expectArray(value, description);
  if (
    values.length !== expected.length ||
    values.some((item, index) => item !== expected[index])
  ) {
    fail(`${description} does not match the supported schema`);
  }
}

function expectFiniteNumber(value: unknown, description: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${description} must be a finite number`);
  }
  return value;
}

function expectPositiveNumber(value: unknown, description: string): number {
  const number = expectFiniteNumber(value, description);
  if (number <= 0) fail(`${description} must be positive`);
  return number;
}

function expectNonNegativeInteger(value: unknown, description: string): number {
  const number = expectFiniteNumber(value, description);
  if (!Number.isSafeInteger(number) || number < 0) {
    fail(`${description} must be a non-negative safe integer`);
  }
  return number;
}

function expectPositiveInteger(value: unknown, description: string): number {
  const number = expectNonNegativeInteger(value, description);
  if (number === 0) fail(`${description} must be positive`);
  return number;
}

function expectNonEmptyString(value: unknown, description: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${description} must be a non-empty string`);
  }
  return value;
}

function expectMatchingString(
  value: unknown,
  pattern: RegExp,
  description: string
): string {
  const string = expectNonEmptyString(value, description);
  if (!pattern.test(string)) fail(`${description} has an invalid format`);
  return string;
}

function expectLiteral<T>(value: unknown, expected: T, description: string): T {
  if (value !== expected) fail(`${description} must be ${JSON.stringify(expected)}`);
  return expected;
}

function expectIsoTimestamp(value: unknown, description: string): string {
  const timestamp = expectNonEmptyString(value, description);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp)) {
    fail(`${description} must be an ISO UTC timestamp`);
  }
  return timestamp;
}

function expectUrl(value: unknown, description: string): string {
  const url = expectNonEmptyString(value, description);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error();
  } catch {
    fail(`${description} must be an HTTP URL`);
  }
  return url;
}

function roundOutput(value: number): number {
  return Number(value.toFixed(6));
}

function fail(message: string): never {
  throw new ZoneArtifactValidationError(message);
}
