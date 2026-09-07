import { createHash } from 'node:crypto';
import { compileLocalCoordinates } from './local-coordinates';
import { compileRoadSurfaces, isSupportedRoad } from './road-surfaces';
import { compileBuildingVolumes, isSupportedBuildingRelation } from './building-volumes';
import { packageZoneArtifact, serializeZoneArtifact } from './zone-artifact';
import type { LoadedZoneSource } from './types';
import type { ZoneQa } from '../../../src/lib/zone/catalogue';

export const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export const stableJson = (value: unknown): string => `${JSON.stringify(value)}\n`;

export function compileZoneProducts(source: LoadedZoneSource) {
  const local = compileLocalCoordinates(source);
  const roads = compileRoadSurfaces(local);
  const buildings = compileBuildingVolumes(source, local, { invalidFeaturePolicy: 'report' });
  const artifact = packageZoneArtifact(source, local, roads, buildings);
  const geometryExclusions = new Map(buildings.excludedFeatures.map(feature => [`${feature.type}/${feature.id}`, feature.reason]));
  const excludedMembers = new Set<number>();
  for (const element of source.osm.elements) if (element.type === 'relation' && geometryExclusions.has(`relation/${element.id}`)) {
    for (const member of element.members) if (member.type === 'way') excludedMembers.add(member.ref);
  }
  const artifactBytes = serializeZoneArtifact(artifact);
  const roadIds = new Set(roads.roads.map(road => road.id));
  const buildingIds = new Set(buildings.buildings.map(building => `${building.source.type}/${building.source.id}`));
  const members = new Set<number>();
  for (const element of source.osm.elements) {
    if (element.type === 'relation' && isSupportedBuildingRelation(element)) {
      for (const member of element.members) if (member.type === 'way') members.add(member.ref);
    }
  }
  const bounds = source.manifest.bounds;
  const outsideNodes = new Set(source.osm.elements.filter(element => element.type === 'node' &&
    (element.lat < bounds.south || element.lat > bounds.north || element.lon < bounds.west || element.lon > bounds.east)).map(element => element.id));
  const features = source.osm.elements.filter(element => element.type !== 'node').sort((a, b) =>
    a.type.localeCompare(b.type, 'en') || a.id - b.id).map(element => {
    const key = `${element.type}/${element.id}`;
    const tags = element.tags ?? {};
    const reasons: string[] = [];
    let road: string | undefined;
    let building: string | undefined;
    if (tags.highway !== undefined) {
      road = element.type !== 'way' ? 'unsupported-relation' : !isSupportedRoad(tags) ?
        (tags.area === 'yes' ? 'excluded-highway-area' : 'excluded-highway-class') :
        roadIds.has(element.id) ? 'included' : 'excluded-outside-buffer';
    }
    if (tags.building !== undefined || tags['building:part'] !== undefined || (element.type === 'way' && members.has(element.id))) {
      building = geometryExclusions.has(key) ? 'unsupported-geometry' :
        element.type === 'way' && excludedMembers.has(element.id) ? 'excluded-invalid-relation-member' : tags['building:part'] !== undefined ? 'unsupported-building-part' :
        buildingIds.has(key) ? 'included' : element.type === 'way' && members.has(element.id) ? 'included-relation-member' :
        tags.building === 'no' ? 'excluded-building-no' :
        element.type === 'relation' ? 'unsupported-relation-topology' : 'unsupported-open-footprint';
    }
    if (geometryExclusions.has(key)) reasons.push(geometryExclusions.get(key)!);
    if (tags.bridge !== undefined && tags.bridge !== 'no') reasons.push('bridge-not-reconstructed');
    if (tags.tunnel !== undefined && tags.tunnel !== 'no') reasons.push('tunnel-not-reconstructed');
    if (tags.layer !== undefined && tags.layer !== '0') reasons.push('layer-not-reconstructed');
    if (tags['building:part'] !== undefined) reasons.push('building-part-excluded');
    if (tags.min_height !== undefined || tags['building:min_level'] !== undefined) reasons.push('raised-base-not-reconstructed');
    const refs = element.type === 'way' ? element.nodes : [];
    const outside = refs.filter(id => outsideNodes.has(id)).length;
    const boundary = refs.length === 0 ? 'relation-see-members' : outside === 0 ? 'inside' : outside === refs.length ? 'all-nodes-outside' : 'crosses-boundary';
    return { id: key, ...(road ? { road } : {}), ...(building ? { building } : {}),
      ...(!road && !building ? { context: 'reference-only' } : {}), boundary, reasons,
      tags: Object.fromEntries(Object.entries(tags).filter(([key]) => ['highway', 'building', 'building:part', 'bridge', 'tunnel', 'layer', 'junction', 'min_height', 'building:min_level'].includes(key)).sort()) };
  });
  const warnings = [
    { code: 'acquisition-coverage', count: 1, action: 'Overpass bbox selection follows OSM node membership; a crossing feature with no node inside the query can be absent. Recursive members can extend beyond the requested bounds.' },
    { code: 'flat-world', count: 1, action: 'All geometry is flat. Do not use this artifact as evidence of elevation or grade-separated crossings.' },
    { code: 'boundary-policy', count: features.filter(f => f.boundary === 'crosses-boundary' || f.boundary === 'all-nodes-outside').length,
      action: 'Road surfaces are clipped; graph segments and complete building footprints may extend beyond the cell. Inspect boundary overlays; no stitching is provided.' }
  ];
  for (const code of ['bridge-not-reconstructed', 'tunnel-not-reconstructed', 'layer-not-reconstructed', 'building-part-excluded', 'raised-base-not-reconstructed']) {
    const count = features.filter(feature => feature.reasons.includes(code)).length;
    if (count) warnings.push({ code, count, action: 'Inspect the listed OSM feature IDs in QA; reconstruction is deferred to Geographic Fidelity.' });
  }
  if (buildings.excludedFeatures.length) warnings.push({ code: 'invalid-building-geometry', count: buildings.excludedFeatures.length, action: 'Unsupported building topology was excluded as a whole, including owned member outlines. Inspect per-feature diagnostic messages; repair/support requires a separate topology policy.' });
  const unsupported = features.filter(f => f.road?.startsWith('unsupported') || f.building?.startsWith('unsupported')).length;
  if (unsupported) warnings.push({ code: 'unsupported-features', count: unsupported, action: 'Review per-feature exclusion reasons before relying on this cell.' });
  const fallbackHeights = buildings.buildings.filter(b => b.height.source === 'fallback').length;
  if (fallbackHeights) warnings.push({ code: 'fallback-heights', count: fallbackHeights, action: 'These volumes use 12 m; inspect source height coverage before interpreting the skyline.' });
  const graphComponents = artifact.streetGraph.statistics.connectedComponents;
  if (graphComponents > 1) warnings.push({ code: 'disconnected-graph', count: graphComponents, action: 'Graph components reflect OSM node connectivity; routing and driveability have not been qualified.' });
  const artifactSha256 = sha256(artifactBytes);
  const qa: ZoneQa = { schemaVersion: 1, id: artifact.slug, sourceSha256: source.manifest.snapshot.sha256,
    artifactSha256, attribution: source.manifest.source.attribution, lines: [] };
  const decisions = new Map(features.map(f => [f.id, f]));
  for (const line of [...local.lines].sort((a,b) => a.id - b.id)) {
    const decision = decisions.get(`way/${line.id}`)!;
    const kind = line.tags?.highway !== undefined ? 'road' :
      line.tags?.building !== undefined || line.tags?.['building:part'] !== undefined || members.has(line.id) ? 'building' : undefined;
    if (!kind) continue;
    qa.lines.push({ id: `way/${line.id}`, kind, included: (kind === 'road' ? decision.road : decision.building)?.startsWith('included') ?? false,
      // Source-derived points, before road rounding/buffering or building extrusion.
      positions: line.positions.flatMap(p => [p.x, 0.15, p.z]) });
  }
  const report = {
    schemaVersion: 1, id: artifact.slug, label: artifact.label,
    bounds, generation: source.manifest.generation ?? null,
    source: { ...source.manifest.source, sha256: source.manifest.snapshot.sha256, byteLength: source.manifest.snapshot.byteLength },
    artifact: { sha256: artifactSha256, byteLength: Buffer.byteLength(artifactBytes), schemaVersion: 1 },
    determinism: { method: 'two independent complete compilations compared byte-for-byte by build/verify', verified: true },
    statistics: { source: source.counts, coordinates: { points: local.points.length, lines: local.lines.length, outsideNodes: outsideNodes.size },
      roads: { ...artifact.geometry.roads.statistics, ...roads.diagnostics, areaSquareMetres: roads.mesh.areaSquareMetres,
        holes: roads.polygons.reduce((n, p) => n + p.rings.length - 1, 0), widthSources: tally(roads.roads.map(r => r.width.source)) },
      buildings: { ...artifact.geometry.buildings.statistics, heightSources: tally(buildings.buildings.map(b => b.height.source)) },
      graph: artifact.streetGraph.statistics, decisions: tally(features.flatMap(f => [f.road, f.building].filter((s): s is string => !!s))) },
    warnings, features
  };
  return { artifact, artifactBytes, qa, qaBytes: stableJson(qa), report, reportBytes: stableJson(report) };
}
function tally(values: string[]) {
  return Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(v => v === value).length]));
}
