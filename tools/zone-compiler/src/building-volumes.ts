import earcut, { deviation } from 'earcut';
import { compileLocalCoordinates } from './local-coordinates';
import { pointInRing, ringsIntersect, validateSimpleRing } from './footprint-topology';
import {
  BUILDING_VOLUME_SCHEMA_VERSION,
  type BuildingFootprint,
  type BuildingFootprintPoint,
  type BuildingFootprintRing,
  type BuildingHeightInference,
  type BuildingVolumeZone,
  type CompiledBuildingVolume,
  type LoadedZoneSource,
  type LocalCoordinateZone,
  type LocalLineFeature,
  type LocalPosition,
  type OsmRelation,
  type OsmRelationMember,
  type OsmTags,
  type OsmWay,
  type TriangulatedBuildingMesh
} from './types';

export const BUILDING_LEVEL_HEIGHT_METRES = 3;
export const BUILDING_FALLBACK_HEIGHT_METRES = 12;
export const MINIMUM_BUILDING_HEIGHT_METRES = 0.5;
export const MAXIMUM_BUILDING_HEIGHT_METRES = 1_000;
export const MINIMUM_BUILDING_LEVELS = 0.5;
export const MAXIMUM_BUILDING_LEVELS = 200;

const METRES_PER_FOOT = 0.3048;
const HEIGHT_PATTERN =
  /^((?:\d+(?:\.\d*)?|\.\d+))\s*(?:(m|metres?|meters?)|(ft|feet|foot))?$/i;
const LEVELS_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
const POSITION_TOLERANCE_METRES = 1e-9;
const TRIANGLE_AREA_TOLERANCE = 1e-10;
const TRIANGULATION_DEVIATION_TOLERANCE = 1e-8;
const OUTPUT_PRECISION_DECIMALS = 6;

interface RelationFootprintExtraction {
  relation: OsmRelation;
  footprints: BuildingFootprint[];
  memberWayIds: number[];
}

interface RingSegment {
  nodeIds: number[];
  positions: LocalPosition[];
}

export function inferBuildingHeight(tags: OsmTags): BuildingHeightInference {
  const taggedHeight = parseTaggedHeight(tags.height);
  if (taggedHeight !== undefined) {
    return {
      metres: taggedHeight,
      source: 'height',
      sourceValue: tags.height as string
    };
  }

  const levels = parseBuildingLevels(tags['building:levels']);
  if (levels !== undefined) {
    return {
      metres: roundOutput(levels * BUILDING_LEVEL_HEIGHT_METRES),
      source: 'building:levels',
      sourceValue: tags['building:levels'] as string
    };
  }

  return {
    metres: BUILDING_FALLBACK_HEIGHT_METRES,
    source: 'fallback',
    sourceValue: String(BUILDING_FALLBACK_HEIGHT_METRES)
  };
}

export function isSupportedBuildingWay(
  line: LocalLineFeature
): line is LocalLineFeature & { tags: OsmTags & { building: string } } {
  return (
    line.closed &&
    isBuildingTag(line.tags) &&
    line.tags['building:part'] === undefined
  );
}

export function isSupportedBuildingRelation(
  relation: OsmRelation
): relation is OsmRelation & { tags: OsmTags & { building: string; type: 'multipolygon' } } {
  if (
    relation.tags?.type !== 'multipolygon' ||
    !isBuildingTag(relation.tags) ||
    relation.tags['building:part'] !== undefined ||
    relation.members.length === 0
  ) {
    return false;
  }

  let outerMembers = 0;
  for (const member of relation.members) {
    if (member.type !== 'way' || !isSupportedRelationRole(member.role)) {
      return false;
    }
    if (normaliseRelationRole(member.role) === 'outer') outerMembers += 1;
  }
  return outerMembers > 0;
}

export function compileBuildingVolumes(
  source: LoadedZoneSource,
  local: LocalCoordinateZone = compileLocalCoordinates(source)
): BuildingVolumeZone {
  validateLocalSourcePair(source, local);

  const lineById = new Map(local.lines.map((line) => [line.id, line]));
  const ways = source.osm.elements
    .filter((element): element is OsmWay => element.type === 'way')
    .sort((first, second) => first.id - second.id);
  const relations = source.osm.elements
    .filter((element): element is OsmRelation => element.type === 'relation')
    .sort((first, second) => first.id - second.id);
  const wayById = new Map(ways.map((way) => [way.id, way]));
  const relationExtractions = new Map<number, RelationFootprintExtraction>();
  const relationMemberWayIds = new Set<number>();

  for (const element of relations) {
    if (!isSupportedBuildingRelation(element)) {
      continue;
    }
    const extraction = extractRelationFootprints(element, lineById, wayById);
    relationExtractions.set(element.id, extraction);
    extraction.memberWayIds.forEach((wayId) => relationMemberWayIds.add(wayId));
  }

  const buildings: CompiledBuildingVolume[] = [];

  // Preserve the existing way-before-relation geometry layout, independent of
  // the order Overpass happened to return elements in.
  for (const element of [...ways, ...relations]) {
    if (element.type === 'way') {
      if (
        relationMemberWayIds.has(element.id) ||
        !isSupportedSourceBuildingWay(element)
      ) {
        continue;
      }
      const line = lineById.get(element.id);
      if (line === undefined) {
        throw new Error(`Building way/${element.id} has no local line`);
      }
      validateLineMatchesWay(line, element);
      if (!isSupportedBuildingWay(line)) {
        throw new Error(`Local line way/${element.id} does not preserve its building tags`);
      }
      buildings.push(
        compileBuilding(
          'way',
          element.id,
          0,
          element.tags,
          createFootprint([
            createClosedRing(line.nodeIds, line.positions, `Building way/${element.id}`)
          ])
        )
      );
      continue;
    }

    if (element.type === 'relation') {
      const extraction = relationExtractions.get(element.id);
      if (extraction === undefined || extraction.relation.tags === undefined) continue;
      extraction.footprints.forEach((footprint, footprintIndex) => {
        buildings.push(
          compileBuilding(
            'relation',
            element.id,
            footprintIndex,
            extraction.relation.tags as OsmTags & { building: string },
            footprint
          )
        );
      });
    }
  }

  if (buildings.length === 0) {
    throw new Error('The fixed source contains no supported building footprints');
  }

  return {
    metadata: {
      schemaVersion: BUILDING_VOLUME_SCHEMA_VERSION,
      slug: local.metadata.slug,
      label: local.metadata.label,
      sourceBounds: { ...local.metadata.sourceBounds },
      coordinateSystem: local.metadata.coordinateSystem,
      supportedFootprints: {
        ways: 'closed-building-ways',
        relations: 'way-member-building-multipolygons',
        buildingParts: 'excluded'
      },
      heightRules: {
        precedence: ['height', 'building:levels', 'fallback'],
        minimumHeightMetres: MINIMUM_BUILDING_HEIGHT_METRES,
        maximumHeightMetres: MAXIMUM_BUILDING_HEIGHT_METRES,
        minimumLevels: MINIMUM_BUILDING_LEVELS,
        maximumLevels: MAXIMUM_BUILDING_LEVELS,
        levelHeightMetres: BUILDING_LEVEL_HEIGHT_METRES,
        fallbackHeightMetres: BUILDING_FALLBACK_HEIGHT_METRES
      },
      groundPlaneY: 0
    },
    buildings
  };
}

export function extrudeBuildingFootprint(
  footprint: BuildingFootprint,
  heightMetres: number
): TriangulatedBuildingMesh {
  if (!Number.isFinite(heightMetres) || heightMetres <= 0) {
    throw new Error('Building height must be a positive finite number');
  }
  validateFootprint(footprint);

  const flat: number[] = [];
  const holes: number[] = [];
  footprint.rings.forEach((ring, ringIndex) => {
    if (ringIndex > 0) holes.push(flat.length / 2);
    ring.points.forEach((point) => flat.push(point.x, point.z));
  });

  const rawRoofIndices = earcut(flat, holes, 2);
  const maximumDeviation = deviation(flat, holes, 2, rawRoofIndices);
  if (
    rawRoofIndices.length === 0 ||
    !Number.isFinite(maximumDeviation) ||
    maximumDeviation > TRIANGULATION_DEVIATION_TOLERANCE
  ) {
    throw new Error(`Building footprint triangulated with deviation ${maximumDeviation}`);
  }

  const positions: number[] = [];
  for (let index = 0; index < flat.length; index += 2) {
    positions.push(flat[index] as number, heightMetres, flat[index + 1] as number);
  }
  const capVertexCount = flat.length / 2;
  for (let index = 0; index < flat.length; index += 2) {
    positions.push(flat[index] as number, 0, flat[index + 1] as number);
  }

  const indices: number[] = [];
  for (let index = 0; index < rawRoofIndices.length; index += 3) {
    const first = rawRoofIndices[index];
    let second = rawRoofIndices[index + 1];
    let third = rawRoofIndices[index + 2];
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('Building roof triangulation produced an incomplete triangle');
    }
    const normalY = triangleNormalY(positions, first, second, third);
    if (Math.abs(normalY) <= TRIANGLE_AREA_TOLERANCE) {
      throw new Error('Building roof triangulation produced a degenerate triangle');
    }
    if (normalY < 0) [second, third] = [third, second];
    indices.push(first, second, third);
  }

  const roofTriangleCount = indices.length / 3;
  for (let index = 0; index < roofTriangleCount; index += 1) {
    const offset = index * 3;
    const first = indices[offset] as number;
    const second = indices[offset + 1] as number;
    const third = indices[offset + 2] as number;
    indices.push(
      first + capVertexCount,
      third + capVertexCount,
      second + capVertexCount
    );
  }
  const floorTriangleCount = roofTriangleCount;

  let wallTriangleCount = 0;
  footprint.rings.forEach((ring, ringIndex) => {
    const signedArea = calculateRingSignedArea(ring.points);
    const rightFacing = (ringIndex === 0) === (signedArea > 0);

    for (let index = 0; index < ring.points.length; index += 1) {
      const current = ring.points[index] as BuildingFootprintPoint;
      const next = ring.points[(index + 1) % ring.points.length] as BuildingFootprintPoint;
      const vertexOffset = positions.length / 3;
      positions.push(
        current.x,
        0,
        current.z,
        next.x,
        0,
        next.z,
        next.x,
        heightMetres,
        next.z,
        current.x,
        heightMetres,
        current.z
      );
      if (rightFacing) {
        indices.push(
          vertexOffset,
          vertexOffset + 3,
          vertexOffset + 1,
          vertexOffset + 1,
          vertexOffset + 3,
          vertexOffset + 2
        );
      } else {
        indices.push(
          vertexOffset,
          vertexOffset + 1,
          vertexOffset + 3,
          vertexOffset + 1,
          vertexOffset + 2,
          vertexOffset + 3
        );
      }
      wallTriangleCount += 2;
    }
  });

  validateMesh(positions, indices);
  const roofArea = calculateHorizontalTriangleArea(
    positions,
    indices.slice(0, roofTriangleCount * 3)
  );
  const calculatedFootprintArea = calculateFootprintArea(footprint.rings);
  const relativeAreaError =
    Math.abs(roofArea - calculatedFootprintArea) / calculatedFootprintArea;
  if (!Number.isFinite(relativeAreaError) || relativeAreaError > 1e-8) {
    throw new Error(
      `Building roof area does not match its footprint: relative error ${relativeAreaError}`
    );
  }

  return {
    positions,
    indices,
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
    roofTriangleCount,
    floorTriangleCount,
    wallTriangleCount,
    maximumDeviation
  };
}

export function combineBuildingMeshes(
  buildings: CompiledBuildingVolume[]
): TriangulatedBuildingMesh {
  if (buildings.length === 0) {
    throw new Error('Cannot combine an empty building mesh collection');
  }

  const combined: TriangulatedBuildingMesh = {
    positions: [],
    indices: [],
    vertexCount: 0,
    triangleCount: 0,
    roofTriangleCount: 0,
    floorTriangleCount: 0,
    wallTriangleCount: 0,
    maximumDeviation: 0
  };

  for (const building of buildings) {
    const vertexOffset = combined.positions.length / 3;
    for (const position of building.mesh.positions) combined.positions.push(position);
    for (const index of building.mesh.indices) combined.indices.push(index + vertexOffset);
    combined.roofTriangleCount += building.mesh.roofTriangleCount;
    combined.floorTriangleCount += building.mesh.floorTriangleCount;
    combined.wallTriangleCount += building.mesh.wallTriangleCount;
    combined.maximumDeviation = Math.max(
      combined.maximumDeviation,
      building.mesh.maximumDeviation
    );
  }
  combined.vertexCount = combined.positions.length / 3;
  combined.triangleCount = combined.indices.length / 3;
  validateMesh(combined.positions, combined.indices);
  return combined;
}

function compileBuilding(
  sourceType: 'way' | 'relation',
  sourceId: number,
  footprintIndex: number,
  tags: OsmTags & { building: string },
  footprint: BuildingFootprint
): CompiledBuildingVolume {
  const height = inferBuildingHeight(tags);
  try {
    return {
      source: { type: sourceType, id: sourceId, footprintIndex },
      building: tags.building,
      footprint,
      height,
      mesh: extrudeBuildingFootprint(footprint, height.metres)
    };
  } catch (error) {
    throw new Error(
      `Building ${sourceType}/${sourceId} footprint ${footprintIndex}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

function extractRelationFootprints(
  relation: OsmRelation & { tags: OsmTags & { building: string; type: 'multipolygon' } },
  lineById: Map<number, LocalLineFeature>,
  wayById: Map<number, OsmWay>
): RelationFootprintExtraction {
  const memberIds = new Set<number>();
  for (const member of relation.members) {
    if (memberIds.has(member.ref)) {
      throw new Error(`Building relation/${relation.id} repeats member way/${member.ref}`);
    }
    memberIds.add(member.ref);
  }
  const outerMembers = relation.members.filter(
    (member) => normaliseRelationRole(member.role) === 'outer'
  );
  const innerMembers = relation.members.filter(
    (member) => normaliseRelationRole(member.role) === 'inner'
  );
  const outerRings = assembleMemberRings(
    relation.id,
    'outer',
    outerMembers,
    lineById,
    wayById
  );
  const innerRings = assembleMemberRings(
    relation.id,
    'inner',
    innerMembers,
    lineById,
    wayById
  );
  const holesByOuter = outerRings.map(() => [] as BuildingFootprintRing[]);

  const allRings = [...outerRings, ...innerRings];
  for (let index = 0; index < allRings.length; index += 1) {
    validateSimpleRing(allRings[index].points, `Building relation/${relation.id} ring ${index}`);
    for (let other = 0; other < index; other += 1) {
      if (ringsIntersect(allRings[index].points, allRings[other].points)) {
        throw new Error(`Building relation/${relation.id} rings ${other} and ${index} intersect or touch`);
      }
    }
  }

  for (const inner of innerRings) {
    const sample = inner.points[0] as BuildingFootprintPoint;
    const containingOuterIndices = outerRings.flatMap((outer, index) =>
      pointInRing(sample, outer.points) ? [index] : []
    );
    if (containingOuterIndices.length === 0) {
      throw new Error(
        `Building relation/${relation.id} inner ring is outside every outer ring`
      );
    }
    // Nested outer islands may have their own courtyards: choose the smallest
    // containing outer, then ensure the resulting volumes do not overlap.
    containingOuterIndices.sort((first, second) =>
      Math.abs(calculateRingSignedArea(outerRings[first].points)) -
      Math.abs(calculateRingSignedArea(outerRings[second].points))
    );
    (holesByOuter[containingOuterIndices[0] as number] as BuildingFootprintRing[]).push(
      inner
    );
  }
  for (let inner = 0; inner < outerRings.length; inner += 1) {
    for (let outer = 0; outer < outerRings.length; outer += 1) {
      if (inner === outer) continue;
      const sample = outerRings[inner].points[0];
      if (
        pointInRing(sample, outerRings[outer].points) &&
        !holesByOuter[outer].some((hole) => pointInRing(sample, hole.points))
      ) {
        throw new Error(`Building relation/${relation.id} has overlapping outer footprints`);
      }
    }
  }

  return {
    relation,
    footprints: outerRings.map((outer, index) =>
      createFootprint([outer, ...(holesByOuter[index] as BuildingFootprintRing[])])
    ),
    memberWayIds: relation.members.map((member) => member.ref)
  };
}

function assembleMemberRings(
  relationId: number,
  role: 'outer' | 'inner',
  members: OsmRelationMember[],
  lineById: Map<number, LocalLineFeature>,
  wayById: Map<number, OsmWay>
): BuildingFootprintRing[] {
  const segments: RingSegment[] = [...members].sort((first, second) => first.ref - second.ref).map((member) => {
    const line = lineById.get(member.ref);
    const way = wayById.get(member.ref);
    if (line === undefined || way === undefined) {
      throw new Error(`Building relation/${relationId} ${role} member way/${member.ref} is unresolved`);
    }
    validateLineMatchesWay(line, way);
    if (line.nodeIds.length !== line.positions.length || line.nodeIds.length < 2) {
      throw new Error(`Building relation/${relationId} ${role} member way/${member.ref} has invalid topology`);
    }
    return { nodeIds: line.nodeIds, positions: line.positions };
  });
  const byEndpoint = new Map<number, RingSegment[]>();
  for (const segment of segments) {
    const first = segment.nodeIds[0];
    const last = segment.nodeIds.at(-1) as number;
    if (first === last) continue;
    for (const endpoint of [first, last]) {
      const connected = byEndpoint.get(endpoint) ?? [];
      connected.push(segment);
      byEndpoint.set(endpoint, connected);
    }
  }
  for (const [nodeId, connected] of byEndpoint) {
    if (connected.length !== 2) {
      throw new Error(`Building relation/${relationId} ${role} members do not form unambiguous closed rings at node/${nodeId} (${connected.length} incident ways)`);
    }
  }
  const unused = new Set(segments);
  const rings: BuildingFootprintRing[] = [];
  for (const firstSegment of segments) {
    if (!unused.delete(firstSegment)) continue;
    const nodeIds = [...firstSegment.nodeIds];
    const positions = [...firstSegment.positions];
    while (nodeIds[0] !== nodeIds.at(-1)) {
      const currentNodeId = nodeIds.at(-1) as number;
      const next = byEndpoint.get(currentNodeId)?.find((segment) => unused.has(segment));
      if (next === undefined) {
        throw new Error(`Building relation/${relationId} ${role} members do not form closed rings at node/${currentNodeId}`);
      }
      unused.delete(next);
      const reversed = next.nodeIds.at(-1) === currentNodeId;
      for (let offset = 1; offset < next.nodeIds.length; offset += 1) {
        const index = reversed ? next.nodeIds.length - 1 - offset : offset;
        nodeIds.push(next.nodeIds[index]);
        positions.push(next.positions[index]);
      }
    }
    rings.push(createClosedRing(
      nodeIds,
      positions,
      `Building relation/${relationId} ${role} ring ${rings.length}`
    ));
  }

  return rings;
}

function createClosedRing(
  sourceNodeIds: number[],
  sourcePositions: LocalPosition[],
  description: string
): BuildingFootprintRing {
  if (
    sourceNodeIds.length !== sourcePositions.length ||
    sourceNodeIds.length < 4 ||
    sourceNodeIds[0] !== sourceNodeIds.at(-1)
  ) {
    throw new Error(`${description} is not a closed footprint ring`);
  }

  const nodeIds = sourceNodeIds.slice(0, -1);
  const points = sourcePositions.slice(0, -1).map((position) => {
    validateGroundPosition(position, description);
    return { x: position.x, z: position.z };
  });
  if (new Set(nodeIds).size < 3) {
    throw new Error(`${description} contains fewer than three unique nodes`);
  }
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index] as BuildingFootprintPoint;
    const next = points[(index + 1) % points.length] as BuildingFootprintPoint;
    if (horizontalDistance(current, next) <= POSITION_TOLERANCE_METRES) {
      throw new Error(`${description} contains a zero-length edge`);
    }
  }
  const area = Math.abs(calculateRingSignedArea(points));
  if (!Number.isFinite(area) || area <= TRIANGLE_AREA_TOLERANCE) {
    throw new Error(`${description} has invalid area`);
  }
  return { nodeIds, points };
}

function createFootprint(rings: BuildingFootprintRing[]): BuildingFootprint {
  if (rings.length === 0) {
    throw new Error('Building footprint requires an outer ring');
  }
  const areaSquareMetres = calculateFootprintArea(rings);
  if (!Number.isFinite(areaSquareMetres) || areaSquareMetres <= TRIANGLE_AREA_TOLERANCE) {
    throw new Error('Building footprint has invalid area');
  }
  return { rings, areaSquareMetres: roundOutput(areaSquareMetres) };
}

function validateFootprint(footprint: BuildingFootprint): void {
  if (footprint.rings.length === 0) {
    throw new Error('Building footprint requires an outer ring');
  }
  footprint.rings.forEach((ring, ringIndex) => {
    if (ring.nodeIds.length !== ring.points.length || ring.points.length < 3) {
      throw new Error(`Building footprint ring ${ringIndex} has invalid topology`);
    }
    ring.points.forEach((point) => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
        throw new Error(`Building footprint ring ${ringIndex} has non-finite coordinates`);
      }
    });
    validateSimpleRing(ring.points, `Building footprint ring ${ringIndex}`);
  });
  for (let index = 1; index < footprint.rings.length; index += 1) {
    const hole = footprint.rings[index].points;
    const outer = footprint.rings[0].points;
    if (ringsIntersect(hole, outer) || !pointInRing(hole[0], outer)) {
      throw new Error(`Building footprint hole ${index} must be strictly inside its outer ring`);
    }
    for (let other = 1; other < index; other += 1) {
      const previous = footprint.rings[other].points;
      if (
        ringsIntersect(hole, previous) ||
        pointInRing(hole[0], previous) ||
        pointInRing(previous[0], hole)
      ) {
        throw new Error(`Building footprint holes ${other} and ${index} overlap, nest, or touch`);
      }
    }
  }
  if (!Number.isFinite(footprint.areaSquareMetres)) {
    throw new Error('Building footprint recorded area must be finite');
  }
  const calculatedArea = calculateFootprintArea(footprint.rings);
  if (!Number.isFinite(calculatedArea) || calculatedArea <= TRIANGLE_AREA_TOLERANCE) {
    throw new Error('Building footprint has invalid area');
  }
  const areaError = Math.abs(calculatedArea - footprint.areaSquareMetres);
  if (areaError > Math.max(1e-6, calculatedArea * 1e-8)) {
    throw new Error('Building footprint recorded area does not match its rings');
  }
}

function validateMesh(positions: number[], indices: number[]): void {
  if (positions.length === 0 || positions.length % 3 !== 0 || indices.length === 0 || indices.length % 3 !== 0) {
    throw new Error('Building extrusion did not produce complete renderable geometry');
  }
  if (!positions.every(Number.isFinite)) {
    throw new Error('Building extrusion contains a non-finite position');
  }
  const vertexCount = positions.length / 3;
  if (!indices.every((index) => Number.isSafeInteger(index) && index >= 0 && index < vertexCount)) {
    throw new Error('Building extrusion contains an invalid index');
  }
  for (let index = 0; index < indices.length; index += 3) {
    const doubleArea = triangleDoubleArea3d(
      positions,
      indices[index] as number,
      indices[index + 1] as number,
      indices[index + 2] as number
    );
    if (!Number.isFinite(doubleArea) || doubleArea <= TRIANGLE_AREA_TOLERANCE) {
      throw new Error('Building extrusion contains a degenerate triangle');
    }
  }
}

function parseTaggedHeight(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = HEIGHT_PATTERN.exec(value.trim());
  if (match === null) return undefined;
  const sourceValue = Number(match[1]);
  const metres = match[3] === undefined ? sourceValue : sourceValue * METRES_PER_FOOT;
  if (
    !Number.isFinite(metres) ||
    metres < MINIMUM_BUILDING_HEIGHT_METRES ||
    metres > MAXIMUM_BUILDING_HEIGHT_METRES
  ) {
    return undefined;
  }
  return roundOutput(metres);
}

function parseBuildingLevels(value: string | undefined): number | undefined {
  if (value === undefined || !LEVELS_PATTERN.test(value.trim())) return undefined;
  const levels = Number(value);
  if (
    !Number.isFinite(levels) ||
    levels < MINIMUM_BUILDING_LEVELS ||
    levels > MAXIMUM_BUILDING_LEVELS
  ) {
    return undefined;
  }
  return levels;
}

function isBuildingTag(tags: OsmTags | undefined): tags is OsmTags & { building: string } {
  const building = tags?.building?.trim();
  return building !== undefined && building.length > 0 && building.toLowerCase() !== 'no';
}

function isSupportedSourceBuildingWay(
  way: OsmWay
): way is OsmWay & { tags: OsmTags & { building: string } } {
  return (
    way.nodes.length >= 4 &&
    way.nodes[0] === way.nodes.at(-1) &&
    isBuildingTag(way.tags) &&
    way.tags['building:part'] === undefined
  );
}

function isSupportedRelationRole(role: string): boolean {
  return role === '' || role === 'outer' || role === 'inner';
}

function normaliseRelationRole(role: string): 'outer' | 'inner' {
  return role === 'inner' ? 'inner' : 'outer';
}

function validateLocalSourcePair(
  source: LoadedZoneSource,
  local: LocalCoordinateZone
): void {
  if (
    source.manifest.slug !== local.metadata.slug ||
    source.manifest.label !== local.metadata.label ||
    (['south', 'north', 'west', 'east'] as const).some(
      (bound) => source.manifest.bounds[bound] !== local.metadata.sourceBounds[bound]
    )
  ) {
    throw new Error('Building source and local-coordinate zone do not match');
  }
}

function validateLineMatchesWay(line: LocalLineFeature, way: OsmWay): void {
  if (
    line.nodeIds.length !== way.nodes.length ||
    line.nodeIds.some((nodeId, index) => nodeId !== way.nodes[index])
  ) {
    throw new Error(`Local line way/${way.id} does not preserve its source node references`);
  }
}

function validateGroundPosition(position: LocalPosition, description: string): void {
  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z) ||
    position.y !== 0
  ) {
    throw new Error(`${description} must contain finite local ground-plane positions`);
  }
}

function calculateFootprintArea(rings: BuildingFootprintRing[]): number {
  return rings.reduce((total, ring, ringIndex) => {
    const area = Math.abs(calculateRingSignedArea(ring.points));
    return ringIndex === 0 ? total + area : total - area;
  }, 0);
}

function calculateRingSignedArea(points: BuildingFootprintPoint[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index] as BuildingFootprintPoint;
    const next = points[(index + 1) % points.length] as BuildingFootprintPoint;
    twiceArea += current.x * next.z - next.x * current.z;
  }
  return twiceArea / 2;
}

function calculateHorizontalTriangleArea(
  positions: number[],
  indices: number[]
): number {
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

function triangleDoubleArea3d(
  positions: number[],
  first: number,
  second: number,
  third: number
): number {
  const firstOffset = first * 3;
  const secondOffset = second * 3;
  const thirdOffset = third * 3;
  const abX = (positions[secondOffset] as number) - (positions[firstOffset] as number);
  const abY = (positions[secondOffset + 1] as number) - (positions[firstOffset + 1] as number);
  const abZ = (positions[secondOffset + 2] as number) - (positions[firstOffset + 2] as number);
  const acX = (positions[thirdOffset] as number) - (positions[firstOffset] as number);
  const acY = (positions[thirdOffset + 1] as number) - (positions[firstOffset + 1] as number);
  const acZ = (positions[thirdOffset + 2] as number) - (positions[firstOffset + 2] as number);
  const crossX = abY * acZ - abZ * acY;
  const crossY = abZ * acX - abX * acZ;
  const crossZ = abX * acY - abY * acX;
  return Math.hypot(crossX, crossY, crossZ);
}

function horizontalDistance(
  first: BuildingFootprintPoint,
  second: BuildingFootprintPoint
): number {
  return Math.hypot(second.x - first.x, second.z - first.z);
}

function roundOutput(value: number): number {
  return Number(value.toFixed(OUTPUT_PRECISION_DECIMALS));
}
