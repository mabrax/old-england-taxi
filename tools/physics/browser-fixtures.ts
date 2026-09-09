/** Controlled test artifacts only, written into the isolated production build. Never published/prepared. */
import { readFileSync, writeFileSync } from 'node:fs';
import { physicalFixture } from '../../tests/helpers/physical-fixture';
import { parseZoneArtifact } from '../../src/lib/zone/zone-artifact';
const camera = physicalFixture();
camera.geometry.roads.positions = [-70,0,-30,70,0,-30,70,0,30,-70,0,30];
camera.geometry.roads.indices = [0,2,1,0,3,2];
camera.geometry.roads.bounds = { minimumX:-70, maximumX:70, minimumY:0, maximumY:0, minimumZ:-30, maximumZ:30 };
Object.assign(camera.geometry.roads.statistics, { vertices:4, triangles:2, centerlineSegments:1 });
camera.coordinates.localBounds = { ...camera.geometry.roads.bounds, maximumY:12 };
camera.streetGraph.nodes = [{ id:1, position:[-15,0,0] }, { id:2, position:[-19,0,0] }];
camera.streetGraph.edges = [{ id:'1:0', from:1, to:2, lengthMetres:4, widthMetres:30, highway:'residential', sourceWayId:1, sourceSegmentIndex:0 }];
camera.streetGraph.statistics = { nodes:2, edges:1, connectedComponents:1, totalLengthMetres:4 };
writeFileSync('dist/phase03-camera.zone.json', JSON.stringify(parseZoneArtifact(camera)));
const unavailable = JSON.parse(readFileSync('public/zones/trafalgar-square-london.zone.json', 'utf8'));
for (const node of unavailable.streetGraph.nodes) { node.position[0] += 10000; node.position[2] += 10000; }
writeFileSync('dist/phase03-unavailable.zone.json', JSON.stringify(parseZoneArtifact(unavailable)));
