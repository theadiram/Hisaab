import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
import { readFile } from 'node:fs/promises';
import { GET } from '../src/app/api/v1/evidence-progress/route';

describe('public evidence progress failures', () => {
  beforeEach(() => vi.resetAllMocks());
  it('returns unavailable when a Delhi coverage claim is invalid', async () => {
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ delhiCoverage: { status: 'complete' } }),
    );
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'Evidence progress unavailable' });
  });
  it('returns unavailable rather than zero coverage when progress cannot be read', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('Unavailable'));
    expect((await GET()).status).toBe(503);
  });
});
