import { mkdtemp, readFile, readdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createZoneRequest, assertZoneId } from '../tools/zone-compiler/src/generation-request';
import { createLocalCoordinateTransform } from '../tools/zone-compiler/src/local-coordinates';
import { acquireZone, overpassQuery } from '../tools/zone-compiler/src/acquire-zone';
import { buildZone, verifyAll, verifyZone } from '../tools/zone-compiler/src/zone-workflow';
import { loadZoneSource } from '../tools/zone-compiler/src/load-zone-source';
import { parseCoordinates } from '../tools/zone-compiler/src/cli';

const directories: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function workspace() { const root = await mkdtemp(join(tmpdir(), 'zone-generation-')); directories.push(root); return { sourcesDirectory: join(root,'sources'), zonesDirectory: join(root,'zones') }; }
const input = { latitude: 10, longitude: 20, label: 'Fixture' };
const snapshot = JSON.stringify({ version: 0.6, generator: 'test', osm3s: { timestamp_osm_base: '2026-09-01T00:00:00Z', copyright: 'ODbL' }, elements: [
  ...[[10,20],[10,20.0001],[10.0001,20.0001],[10.0001,20]].map(([lat,lon],i) => ({ type:'node', id:i+1, lat, lon })),
  { type:'way', id:10, nodes:[1,2], tags:{highway:'residential',bridge:'yes',layer:'1'} },
  { type:'way', id:11, nodes:[1,2,3,4,1], tags:{building:'yes'} },
  { type:'way', id:12, nodes:[1,2,3,4,1], tags:{'building:part':'yes'} }
] });
const response = (body = snapshot) => new Response(body, { headers:{'Content-Type':'application/json'} });

describe('coordinate generation contract', () => {
  it('defaults to metre cells, preserves origin and uses all request precision in identity', () => {
    const r = createZoneRequest(input);
    expect(r.widthMetres).toBe(1000); expect(r.heightMetres).toBe(1000);
    const transform = createLocalCoordinateTransform(r.bounds);
    expect(transform.metadata.origin.latitude).toBe(input.latitude);
    const west = transform.project({latitude:input.latitude,longitude:r.bounds.west});
    const east = transform.project({latitude:input.latitude,longitude:r.bounds.east});
    expect(east.x-west.x).toBeCloseTo(1000, 3);
    expect(createZoneRequest({...input,label:'Another name'}).id).toBe(r.id);
    expect(createZoneRequest({...input,latitude:10.0000000001}).id).not.toBe(r.id);
    expect(createZoneRequest({...input,widthMetres:999}).id).not.toBe(r.id);
    expect(createZoneRequest({latitude:-0,longitude:0}).id).toBe(createZoneRequest({latitude:0,longitude:0}).id);
  });
  it.each([{latitude:NaN},{longitude:Infinity},{latitude:75},{latitude:-90},{longitude:181},{longitude:179.999},{latitude:74.999},{widthMetres:0},{heightMetres:-1},{widthMetres:2001},{heightMetres:Infinity},{label:'\nunsafe'}])('rejects invalid input %j', change => {
    expect(() => createZoneRequest({...input,...change})).toThrow();
  });
  it.each(['../zone','a/b','a\\b','..','%2e%2e','a'.repeat(101),'Zone','a--b'])('rejects unsafe ID %s', id => expect(() => assertZoneId(id)).toThrow());
  it('requires explicit coordinates and rejects unknown, duplicate and empty CLI options', () => {
    for (const args of [[],['--lat','10'],['--lat','','--lon','20'],['--lat','10','--lon','20','--oops','x'],['--lat','10','--lon','20','--lat','11']]) expect(() => parseCoordinates(args)).toThrow();
    expect(parseCoordinates(['--lat','-10','--lon','-20'])).toEqual({latitude:-10,longitude:-20});
    expect(overpassQuery(input)).toContain('[timeout:60][maxsize:67108864]');
  });
});

describe('acquire → offline build → catalogue → report', () => {
  it('publishes a verified immutable snapshot, reuses it without network and rejects changed labels', async () => {
    const options = await workspace(); const fetcher = vi.fn<typeof fetch>(async () => response());
    const first = await acquireZone(input,{...options,fetcher});
    expect(first.reused).toBe(false);
    expect((await loadZoneSource(first.id,options)).manifest.source.acquiredAt).toBeTruthy();
    expect(await readFile(join(options.sourcesDirectory,first.id,'source.osm.json'),'utf8')).toBe(snapshot);
    expect((await acquireZone(input,{...options,fetcher})).reused).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(acquireZone({...input,label:'different'},{...options,fetcher})).rejects.toThrow('Immutable');
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('error');
  });
  it('builds offline from another cwd, preserves unrelated bytes and verifies every output', async () => {
    const options = await workspace();
    const first = await acquireZone(input,{...options,fetcher:async()=>response()});
    const second = await acquireZone({...input,widthMetres:800},{...options,fetcher:async()=>response()});
    vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('network disabled'));
    const cwd = process.cwd();
    try { process.chdir(tmpdir()); await buildZone(first.id,options); await buildZone(second.id,options); } finally { process.chdir(cwd); }
    const files = await readdir(options.zonesDirectory);
    const before = await Promise.all(files.map(file => readFile(join(options.zonesDirectory,file),'utf8')));
    await buildZone(first.id,options);
    expect(await Promise.all(files.map(file => readFile(join(options.zonesDirectory,file),'utf8')))).toEqual(before);
    expect(await verifyAll(options)).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
    const report = JSON.parse(await readFile(join(options.zonesDirectory,`${first.id}.report.json`),'utf8'));
    expect(report.warnings).toEqual(expect.arrayContaining([expect.objectContaining({code:'bridge-not-reconstructed',count:1}),expect.objectContaining({code:'building-part-excluded',count:1})]));
    expect(report.features.find((f:{id:string}) => f.id==='way/12').building).toBe('unsupported-building-part');
    await writeFile(join(options.zonesDirectory,`${first.id}.qa.json`),'{}');
    await expect(verifyZone(first.id,options)).rejects.toThrow('Stale qa');
  });
  it.each([
    ['http', async () => new Response('busy',{status:429})],
    ['network', async () => {throw new Error('offline');}],
    ['html', async () => new Response('<html>error</html>')],
    ['json', async () => response('{')],
    ['empty', async () => response('')],
    ['remark', async () => response(JSON.stringify({...JSON.parse(snapshot),remark:'runtime error'}))],
    ['references', async () => response(snapshot.replace('[1,2]', '[1,999]'))],
    ['declared size', async () => new Response(snapshot,{headers:{'Content-Type':'application/json','Content-Length':'999999999'}})],
    ['partial', async () => new Response(snapshot,{headers:{'Content-Type':'application/json','Content-Length':'100'}})],
    ['stream', async () => new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));c.error(new Error('disconnected'));}}),{headers:{'Content-Type':'application/json'}})]
  ] as const)('cleans up after %s failure', async (_name,fetcher) => {
    const options = await workspace();
    await expect(acquireZone(input,{...options,fetcher})).rejects.toThrow();
    expect(await readdir(options.sourcesDirectory)).toEqual([]);
  });
  it('limits streamed bytes and a hanging fetch/body, then permits retry', async () => {
    const options = await workspace();
    await expect(acquireZone(input,{...options,maxBytes:10,fetcher:async()=>response()})).rejects.toThrow('byte limit');
    await expect(acquireZone(input,{...options,timeoutMs:20,fetcher:()=>new Promise(()=>{})})).rejects.toThrow('timed out');
    await expect(acquireZone(input,{...options,timeoutMs:20,fetcher:async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}}),{headers:{'Content-Type':'application/json'}})})).rejects.toThrow('timed out');
    expect(await readdir(options.sourcesDirectory)).toEqual([]);
    expect((await acquireZone(input,{...options,fetcher:async()=>response()})).reused).toBe(false);
  });
  it('rejects source symlinks and altered request identity before building', async () => {
    const options=await workspace(); const {id}=await acquireZone(input,{...options,fetcher:async()=>response()});
    const path=join(options.sourcesDirectory,id,'manifest.json');
    const manifest=JSON.parse(await readFile(path,'utf8')); manifest.generation.latitude+=1;
    await writeFile(path,JSON.stringify(manifest));
    await expect(loadZoneSource(id,options)).rejects.toThrow('Generation request');
    await symlink(join(options.sourcesDirectory,id),join(options.sourcesDirectory,'alias'));
    await expect(loadZoneSource('alias',options)).rejects.toThrow('symbolic');
  });
});
