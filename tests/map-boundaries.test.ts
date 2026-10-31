import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('shares one boundary download across layers and subsequent navigation', async () => {
  const geometry = {
    type: 'FeatureCollection',
    features: Array.from({ length: 36 }, () => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [] },
    })),
  };
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => geometry });
  vi.stubGlobal('fetch', fetch);
  const { loadMapBoundary } = await import('../src/lib/map-boundaries');
  const [layer, focus] = await Promise.all([loadMapBoundary('states'), loadMapBoundary('states')]);
  expect(layer).toBe(geometry);
  expect(focus).toBe(geometry);
  expect(await loadMapBoundary('states')).toBe(geometry);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('retries a failed download instead of keeping a rejected promise', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    });
  vi.stubGlobal('fetch', fetch);
  const { loadMapBoundary } = await import('../src/lib/map-boundaries');
  await expect(loadMapBoundary('india')).rejects.toThrow('Map boundary unavailable');
  await expect(loadMapBoundary('india')).resolves.toMatchObject({ type: 'FeatureCollection' });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('rejects incomplete state editions and versions URLs against the original bytes', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    }),
  );
  const { loadMapBoundary, boundaryUrls } = await import('../src/lib/map-boundaries');
  await expect(loadMapBoundary('states')).rejects.toThrow('edition is incomplete');
  for (const address of Object.values(boundaryUrls)) {
    const url = new URL(address, 'http://localhost');
    const hash = createHash('sha256')
      .update(readFileSync('public' + url.pathname))
      .digest('hex')
      .slice(0, 12);
    expect(url.searchParams.get('v')).toBe(hash);
  }
});
