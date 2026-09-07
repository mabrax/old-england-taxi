import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { loadSelectedZone } from '../src/lib/zone/load-selected-zone';
import { parseCatalogue, parseZoneQa, safeAssetUrl } from '../src/lib/zone/catalogue';

const id = 'trafalgar-square-london';
const publicRoot = new URL('../public/',import.meta.url);
const read = (url:string) => readFile(new URL(url.replace(/^\//,''),publicRoot),'utf8');
const fetcher: typeof fetch = async url => new Response(await read(String(url)),{headers:{'Content-Type':'application/json'}});

describe('prepared catalogue selection and QA', () => {
  it('selects the first catalogue entry by default and explicit IDs independently', async () => {
    const catalogue = parseCatalogue(JSON.parse(await read('/zones/index.json')));
    expect((await loadSelectedZone('',fetcher)).artifact.slug).toBe(catalogue.zones[0].id);
    const selected = await loadSelectedZone(`?zone=${id}&qa=1`,fetcher);
    expect(selected.artifact.slug).toBe(id);
    expect(selected.qa?.lines.length).toBeGreaterThan(1000);
    expect(selected.qa?.lines.some(line=>!line.included)).toBe(true);
    expect(selected.qa?.lines.some(line=>line.kind==='road')).toBe(true);
    expect(selected.qa?.lines.some(line=>line.kind==='building')).toBe(true);
  });
  it('loads safe explicit artifact URLs and verifies QA matches the actual artifact bytes', async () => {
    const selected=await loadSelectedZone(`?artifact=/zones/${id}.zone.json&qa=1`,fetcher);
    expect(selected.catalogue).toBeUndefined(); expect(selected.qa?.id).toBe(id);
    const wrongQa:typeof fetch=async url=>{
      const bytes=await read(String(url));
      if(String(url).endsWith('.qa.json')) return new Response(JSON.stringify({...JSON.parse(bytes),artifactSha256:'0'.repeat(64)}));
      return new Response(bytes);
    };
    await expect(loadSelectedZone(`?artifact=/zones/${id}.zone.json&qa=1`,wrongQa)).rejects.toThrow('provenance');
  });
  it.each(['?zone=missing','?zone=../escape','?zone=a&artifact=/a.json','?artifact=https://example.com/a.json','?artifact=//example.com/a.json','?artifact=/zones/../a.json','?artifact=/%2e%2e/a.json'])('rejects unavailable/unsafe selection %s', async search=>{
    await expect(loadSelectedZone(search,fetcher)).rejects.toThrow();
  });
  it('rejects HTTP failure, empty/invalid catalogue and stale hashes',async()=>{
    await expect(loadSelectedZone('',async()=>new Response('',{status:404}))).rejects.toThrow('HTTP 404');
    await expect(loadSelectedZone('',async()=>new Response('{"schemaVersion":1,"zones":[]}'))).rejects.toThrow('empty');
    await expect(loadSelectedZone('',async()=>new Response('{}'))).rejects.toThrow('catalogue');
    const stale: typeof fetch = async url => new Response((await read(String(url)))+(String(url).endsWith('.zone.json')?' ':''));
    await expect(loadSelectedZone(`?zone=${id}`,stale)).rejects.toThrow('hash mismatch');
  });
  it('does not fetch QA outside QA mode and propagates cancellation',async()=>{
    const spy=vi.fn(fetcher); await loadSelectedZone(`?zone=${id}`,spy);
    expect(spy.mock.calls.some(([url])=>String(url).includes('.qa.json'))).toBe(false);
    const controller=new AbortController();controller.abort();spy.mockClear();
    await expect(loadSelectedZone('',spy,{signal:controller.signal})).rejects.toThrow('cancelled');
    expect(spy).not.toHaveBeenCalled();
  });
  it('validates catalogue identities, paths, counts and QA numeric arrays',async()=>{
    const good=JSON.parse(await read('/zones/index.json'));
    expect(()=>parseCatalogue({...good,zones:[good.zones[0],good.zones[0]]})).toThrow('duplicate');
    expect(()=>parseCatalogue({...good,zones:[{...good.zones[0],summary:{triangles:-1,buildings:1,graphEdges:1}}]})).toThrow('summary');
    const qa=JSON.parse(await read(`/zones/${id}.qa.json`));qa.lines[0].positions[0]=null;
    expect(()=>parseZoneQa(qa)).toThrow('QA line');
    expect(()=>safeAssetUrl('/a/./b.json')).toThrow();
  });
});
