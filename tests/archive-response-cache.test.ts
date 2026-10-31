import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ map: vi.fn() }));
vi.mock('../src/lib/hosted-geography', () => ({
  hostedGeographyEnabled: () => true,
  hostedAssetMap: mocks.map,
}));
vi.mock('../src/lib/asset-geography', () => ({ assetMap: vi.fn() }));
beforeEach(() => {
  vi.resetModules();
  mocks.map.mockReset().mockResolvedValue({ total: 12, spendingLinked: false });
});
afterEach(() => vi.unstubAllEnvs());
it('reuses exact archive results and exposes only a short public cache', async () => {
  const { GET } = await import('../src/app/api/v1/map/assets/route');
  const request = () =>
    new Request('https://adiram.me/api/v1/map/assets?bbox=84,19,86,21&mode=count');
  const [a, b] = await Promise.all([GET(request()), GET(request())]);
  expect(await a.json()).toEqual(await b.json());
  expect(a.headers.get('cache-control')).toBe('public, max-age=60');
  expect(mocks.map).toHaveBeenCalledOnce();
});
it('keeps filters and pages separate, including duplicate parameter order', async () => {
  const { GET } = await import('../src/app/api/v1/map/assets/route');
  for (const q of [
    'q=school&q=road',
    'q=road&q=school',
    'q=school&offset=25',
    'q=school&kind=health',
  ])
    await GET(new Request('https://adiram.me/api/v1/map/assets?mode=members&' + q));
  expect(mocks.map).toHaveBeenCalledTimes(4);
});
it('does not cache errors or bypass input validation', async () => {
  const { GET } = await import('../src/app/api/v1/map/assets/route');
  mocks.map.mockRejectedValueOnce(new Error('storage down'));
  const req = () => new Request('https://adiram.me/api/v1/map/assets?mode=count');
  const failed = await GET(req());
  expect(failed.status).toBe(503);
  expect(failed.headers.get('cache-control') ?? '').not.toContain('public');
  expect((await GET(req())).status).toBe(200);
  expect((await GET(new Request('https://adiram.me/api/v1/map/assets?bbox=bad'))).status).toBe(400);
  expect(mocks.map).toHaveBeenCalledTimes(2);
});
