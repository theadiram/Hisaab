import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import config from '../data/map-overview.json';
import assets from '../data/geosadak-acquisition.json';
import {overviewForKind,overviewZoom,type Overview} from '../src/lib/map-overview';

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();});

it('conserves every source record and category at every overview zoom',()=>{
  for(const file of config.files){
    const bytes=readFileSync('public'+config.urlTemplate.replace('{z}',String(file.zoom)));
    const overview=JSON.parse(bytes.toString()) as Overview;
    expect(overviewForKind(overview,null).features.reduce((n,f)=>n+f.properties.count,0)).toBe(812976);
    for(const [kind,total] of Object.entries(assets.byKind))expect(overviewForKind(overview,kind).features.reduce((n,f)=>n+f.properties.count,0)).toBe(total);
    expect(gzipSync(bytes).length).toBeLessThan(15000);
  }
  expect(overviewZoom(-2)).toBe(0);expect(overviewZoom(8)).toBe(5);
});

it('falls back to the verified local overview if the external host fails',async()=>{
  vi.stubEnv('NEXT_PUBLIC_HISAAB_MAP_TILE_BASE_URL','https://maps.example.com/edition-test');
  const overview=JSON.parse(readFileSync('public'+config.urlTemplate.replace('{z}','3'),'utf8'));
  const fetch=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ok:true,json:async()=>overview});
  vi.stubGlobal('fetch',fetch);
  const {loadMapOverview}=await import('../src/lib/map-overview');
  expect((await loadMapOverview(3)).features).toHaveLength(overview.features.length);
  expect(fetch.mock.calls[0][0]).toBe('https://maps.example.com/edition-test/overview/z3.geojson');
  expect(fetch.mock.calls[1][0]).toBe(config.urlTemplate.replace('{z}','3'));
});

it('accepts only credential-free HTTPS static delivery roots',async()=>{
  const {mapDeliveryBase}=await import('../src/lib/map-delivery');
  for(const value of ['http://maps.example.com','https://secret@maps.example.com','https://maps.example.com/?key=secret','invalid'])expect(mapDeliveryBase(value)).toBeNull();
  expect(mapDeliveryBase('https://maps.example.com/edition-test/')).toBe('https://maps.example.com/edition-test');
});

it('retries transient tile failures with bounded backoff and leaves missing or rejected tiles alone',async()=>{
  const {tileRetryDelay}=await import('../src/lib/map-delivery');
  for(const status of [undefined,0,500,502,503,504,408,429])expect(tileRetryDelay(status,0)).toBe(1000);
  expect([0,1,2,3].map(attempt=>tileRetryDelay(503,attempt))).toEqual([1000,2000,4000,null]);
  for(const status of [400,403,404,413])expect(tileRetryDelay(status,0)).toBeNull();
});
