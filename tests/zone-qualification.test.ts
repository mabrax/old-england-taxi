import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { listSourceIds } from '../tools/zone-compiler/src/zone-workflow';
import { loadZoneSource } from '../tools/zone-compiler/src/load-zone-source';
import { compileBuildingVolumes } from '../tools/zone-compiler/src/building-volumes';
import { compileLocalCoordinates } from '../tools/zone-compiler/src/local-coordinates';

describe('real-cell qualification evidence', () => {
  it('retains five provenanced real sources with materially different source features', async () => {
    const ids=await listSourceIds();expect(ids).toHaveLength(5);
    const sources=await Promise.all(ids.map(id=>loadZoneSource(id)));
    for(const source of sources) {
      expect(source.manifest.source.licence.id).toBe('ODbL-1.0');
      const report=JSON.parse(await readFile(new URL(`../public/zones/${source.manifest.slug}.report.json`,import.meta.url),'utf8'));
      expect(report.source.sha256).toBe(source.manifest.snapshot.sha256);
      for(const [tag,code] of [['bridge','bridge-not-reconstructed'],['tunnel','tunnel-not-reconstructed'],['layer','layer-not-reconstructed'],['building:part','building-part-excluded']]) {
        const elements=source.osm.elements.filter(e=>e.type!=='node' && e.tags?.[tag]!==undefined &&
          (tag==='building:part' || e.tags[tag] !== (tag==='layer'?'0':'no')));
        const warning=report.warnings.find((w:{code:string})=>w.code===code);
        expect(warning?.count ?? 0).toBe(elements.length);
        for(const element of elements) expect(report.features.find((f:{id:string})=>f.id===`${element.type}/${element.id}`).reasons).toContain(code);
      }
      expect(report.statistics.coordinates.outsideNodes).toBeGreaterThan(0);
      if(source.manifest.label==='Lucca historic centre') expect(report.statistics.buildings.holes).toBeGreaterThan(20);
    }
    expect(sources.filter(source=>source.manifest.generation)).toHaveLength(4);
  });
  it('keeps strict topology rejection and reports whole-feature exclusion in generation',async()=>{
    const sources=await Promise.all((await listSourceIds()).map(id=>loadZoneSource(id)));
    const source=sources.find(source=>source.manifest.label==='Chicago River North grid')!;
    const local=compileLocalCoordinates(source);
    expect(()=>compileBuildingVolumes(source,local)).toThrow('rings 0 and 1 intersect or touch');
    const compiled=compileBuildingVolumes(source,local,{invalidFeaturePolicy:'report'});
    expect(compiled.excludedFeatures).toEqual([expect.objectContaining({type:'relation',id:9522023,reason:expect.stringContaining('intersect or touch')})]);
    const relation=source.osm.elements.find(e=>e.type==='relation' && e.id===9522023);
    if(relation?.type!=='relation') throw new Error('Missing qualification relation');
    const members=new Set(relation.members.filter(m=>m.type==='way').map(m=>m.ref));
    expect(compiled.buildings.some(b=>b.source.type==='way' && members.has(b.source.id))).toBe(false);
  });
  it('never converts local/source invariants into an unsupported-feature warning',async()=>{
    const sources=await Promise.all((await listSourceIds()).map(id=>loadZoneSource(id)));
    const source=sources.find(source=>source.manifest.label==='Chicago River North grid')!;
    const relation=source.osm.elements.find(e=>e.type==='relation' && e.id===9522023);
    if(relation?.type!=='relation') throw new Error('Missing fixture relation');
    const local=compileLocalCoordinates(source);
    const member=local.lines.find(line=>line.id===relation.members[0].ref)!;
    member.nodeIds[0]+=1000000;
    expect(()=>compileBuildingVolumes(source,local,{invalidFeaturePolicy:'report'})).toThrow('source node references');
  });

});
