import { physicalFixture } from './physical-fixture';
export function vehicleFixture() {
  const a = physicalFixture();
  a.geometry.roads.positions = [-100,0,-60,100,0,-60,100,0,-20,-100,0,-20,-5,0,100,5,0,100,-5,0,80,5,0,80];
  a.geometry.roads.indices = [0,2,1,0,3,2,4,5,6,5,7,6];
  a.streetGraph.nodes = [{ id: 1, position: [-50,0,-40] },{ id: 2, position: [50,0,-40] }];
  a.streetGraph.edges = [{ id:'hint',from:1,to:2,lengthMetres:100,widthMetres:40,highway:'residential',sourceWayId:1,sourceSegmentIndex:0 }];
  return a;
}
