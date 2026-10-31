import { afterEach, expect, it, vi } from 'vitest';
import { historicalCacheHeaders } from '../src/lib/historical-cache';

afterEach(() => vi.unstubAllEnvs());

it('keeps private previews and blocked release mode out of shared caches', () => {
  for (const [preview, release] of [
    ['false', 'false'],
    ['true', 'true'],
    ['', ''],
  ]) {
    vi.stubEnv('HISAAB_PUBLIC_PREVIEW', preview);
    vi.stubEnv('HISAAB_PUBLIC_RELEASE', release);
    expect(historicalCacheHeaders(3600, 86400)).toEqual({ 'Cache-Control': 'private, no-store' });
  }
});

it('uses a bounded public cache with all tile filters in its key', () => {
  vi.stubEnv('HISAAB_PUBLIC_PREVIEW', 'true');
  vi.stubEnv('HISAAB_PUBLIC_RELEASE', 'false');
  const headers = historicalCacheHeaders(3600, 86400, 'q|kind|shard|v');
  expect(headers['Cache-Control']).toContain('max-age=3600');
  expect(headers['Netlify-CDN-Cache-Control']).toBe('public, durable, max-age=86400');
  expect(headers['Netlify-Vary']).toBe('query=q|kind|shard|v');
});
