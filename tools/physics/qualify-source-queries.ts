/** Offline source locators only; physics consumes the unchanged prepared artifact mesh. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadZoneSource} from '../zone-compiler/src/load-zone-source';
import {compileBuildingVolumes} from '../zone-compiler/src/building-volumes';
import {pointInRing} from '../zone-compiler/src/footprint-topology';
import {createPhysicalWorld,initializeRapier} from '../../src/lib/physics/physical-world';
import {createSpawnSearch} from '../../src/lib/physics/vehicle-spawn';
import {box} from '../../tests/helpers/physical-fixture';
await initializeRapier();const out=[];
for(const z of JSON.parse(readFileSync('public/zones/index.json','utf8')).zones){
 const bytes=readFileSync(`public/zones/${z.id}.zone.json`),a=JSON.parse(bytes.toString()),report=JSON.parse(readFileSync(`public/zones/${z.id}.report.json`,'utf8')),p=createPhysicalWorld(a),source=await loadZoneSource(z.id),volumes=compileBuildingVolumes(source,undefined,{invalidFeaturePolicy:'report'});
 const result:any={id:z.id,label:z.label,sha256:createHash('sha256').update(bytes).digest('hex'),holes:a.geometry.buildings.statistics.holes,courtyard:null,limitations:{excludedBuildings:report.features.filter((f:any)=>f.building==='unsupported-geometry'),examples:[]}};
 try{
  const start=createSpawnSearch(a,p).find().pose!.position;
  const nodes=new Map(a.streetGraph.nodes.map((n:any)=>[n.id,n.position]));
  const ranked=a.streetGraph.edges.map((edge:any)=>{const u=nodes.get(edge.from) as number[],v=nodes.get(edge.to) as number[],dx=v[0]-u[0],dz=v[2]-u[2],t=Math.max(0,Math.min(1,((start.x-u[0])*dx+(start.z-u[2])*dz)/(dx*dx+dz*dz)));return {edge,distance:Math.hypot(start.x-u[0]-t*dx,start.z-u[2]-t*dz)};}).sort((u:any,v:any)=>u.distance-v.distance);
  const hint=ranked[0],way=source.osm.elements.find(e=>e.type==='way'&&e.id===hint.edge.sourceWayId);
  result.startArea={position:start,nearestSourceWay:hint.edge.sourceWayId,name:way?.tags?.name,highway:way?.tags?.highway,distanceToSegment:hint.distance};
  for(const b of volumes.buildings){for(const [index,ring] of b.footprint.rings.entries()){
   if(index===0)continue;const xs=ring.points.map(v=>v.x),zs=ring.points.map(v=>v.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
   for(let i=1;i<10&&!result.courtyard;i++)for(let j=1;j<10&&!result.courtyard;j++){
    const x=minX+(maxX-minX)*i/10,z=minZ+(maxZ-minZ)*j/10,query=box(x,z,.5,.1,2);
    if(![[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].every(([dx,dz])=>pointInRing({x:x+dx,z:z+dz},ring.points)))continue;
    if(!p.clearance(query).clear)continue;
    result.courtyard={source:b.source,ringIndex:index,ringNodeIds:ring.nodeIds,query,clearance:p.clearance(query),surfaceIntersection:p.intersectsBuildingSurface(query),purpose:'1 m query box in real included courtyard; not vehicle spawn or accessible entrance'};
   }
  }if(result.courtyard)break;}
  for(const [category,predicate] of [
   ['flattened bridge',(f:any)=>f.tags?.bridge&&f.tags.bridge!=='no'],['flattened tunnel',(f:any)=>f.tags?.tunnel&&f.tags.tunnel!=='no'],['nonzero layer',(f:any)=>f.tags?.layer&&f.tags.layer!=='0'],['building part',(f:any)=>f.tags?.['building:part']],['excluded footway',(f:any)=>f.tags?.highway==='footway'],['boundary outlier',(f:any)=>f.boundary==='outside'||f.boundary==='crosses-boundary']
  ] as const){const features=report.features.filter(predicate);result.limitations.examples.push({category,count:features.length,examples:features.slice(0,2)});}
  if(result.holes&&!result.courtyard)throw Error('No real courtyard query '+z.label);out.push(result);console.log(z.label,JSON.stringify(result.courtyard));
 }finally{p.dispose();}
}
writeFileSync(process.argv[2]??'.zone-cache/phase-04/source-queries.json',JSON.stringify({checkedAt:new Date().toISOString(),method:'Read source footprints only to locate queries; actual clearance uses artifact roof/mesh index. No source data enters runtime.',cells:out},null,2)+'\n');
