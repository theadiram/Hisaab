import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ exists: vi.fn(), read: vi.fn() }));
vi.mock('node:fs', () => ({ existsSync: mocks.exists }));
vi.mock('node:fs/promises', () => ({ readFile: mocks.read }));
vi.mock('../src/lib/hosted-geography', () => ({
  hostedGeographyEnabled: () => false,
  geographyStatus: vi.fn(),
}));
import { GET } from '../src/app/api/v1/geography/route';
beforeEach(() => {
  mocks.exists.mockReturnValue(true);
  mocks.read.mockReset();
  vi.stubEnv('NEXT_PUBLIC_HISAAB_MAP_TILE_BASE_URL', 'https://maps.example.invalid/edition');
});
afterEach(() => vi.unstubAllEnvs());
it('keeps R2 shard names when counts and asset cards use local SQLite', async () => {
  mocks.read.mockResolvedValue(
    JSON.stringify({
      version: 'hisaab-geography/1',
      count: 812976,
      maxzoom: 9,
      edition: 'preserved-edition',
      archives: [
        { file: 'education.pmtiles', kind: 'education' },
        { file: 'public-0.pmtiles', kind: 'public' },
      ],
    }),
  );
  const r = await GET();
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({
    count: 812976,
    maxzoom: 9,
    delivery: 'local_sqlite',
    edition: 'preserved-edition',
    shards: [
      { id: 'education', kind: 'education' },
      { id: 'public-0', kind: 'public' },
    ],
  });
});
it('fails closed if R2 metadata is missing or has a different record count', async () => {
  mocks.read.mockResolvedValue(
    JSON.stringify({ version: 'hisaab-geography/1', count: 1, archives: [{}] }),
  );
  expect((await GET()).status).toBe(503);
  mocks.read.mockRejectedValue(new Error('Missing file'));
  expect((await GET()).status).toBe(503);
});
it('keeps the all-record local tile fallback when R2 is not configured', async () => {
  vi.stubEnv('NEXT_PUBLIC_HISAAB_MAP_TILE_BASE_URL', '');
  const r = await GET();
  expect(await r.json()).toEqual({
    count: 812976,
    maxzoom: 14,
    delivery: 'local_sqlite',
    spendingLinked: false,
  });
  expect(mocks.read).not.toHaveBeenCalled();
});
