import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({assetMap:vi.fn(),hostedEnabled:vi.fn(()=>false),hostedMap:vi.fn()}));
vi.mock('../src/lib/asset-geography',()=>({assetMap:mocks.assetMap}));
vi.mock('../src/lib/hosted-geography',()=>({assetMap:mocks.hostedMap,hostedAssetMap:mocks.hostedMap,hostedGeographyEnabled:mocks.hostedEnabled}));
import {GET} from '../src/app/api/v1/map/assets/route';

const request=(query='bbox=68,5,98,38')=>new Request(`https://hisaab.test/api/v1/map/assets?${query}`);

describe('archived location map delivery',()=>{
 beforeEach(()=>{mocks.assetMap.mockReturnValue({type:'FeatureCollection',features:[],total:0});mocks.hostedEnabled.mockReturnValue(false);});
 afterEach(()=>vi.unstubAllEnvs());

 it('lets the public preview share archived location groups, like the tiles they pair with',async()=>{
  vi.stubEnv('HISAAB_PUBLIC_PREVIEW','true');vi.stubEnv('HISAAB_PUBLIC_RELEASE','false');
  const headers=(await GET(request())).headers;
  expect(headers.get('Cache-Control')).toContain('max-age=300');
  // Every filter that changes the body must be in the edge cache key.
  expect(headers.get('Netlify-Vary')).toBe('query=bbox|q|kind|mode|offset|cells');
 });

 it('keeps the private build out of shared caches',async()=>{
  vi.stubEnv('HISAAB_PUBLIC_PREVIEW','false');
  expect((await GET(request())).headers.get('Cache-Control')).toBe('private, no-store');
 });

 it('never caches a rejected request',async()=>{
  vi.stubEnv('HISAAB_PUBLIC_PREVIEW','true');vi.stubEnv('HISAAB_PUBLIC_RELEASE','false');
  const response=await GET(request('bbox=200,5,98,38'));
  expect(response.status).toBe(400);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
 });
});
