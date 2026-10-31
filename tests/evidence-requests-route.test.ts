import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/admin', () => ({ requireAdmin: mocks.admin }));
vi.mock('node:fs/promises', () => ({ readFile: mocks.read }));
import { GET } from '../src/app/api/v1/admin/evidence-requests/route';

describe('Delhi private request and source-candidate boundary', () => {
  beforeEach(() => vi.resetAllMocks());
  it('checks owner MFA before reading any document or private candidate', async () => {
    mocks.admin.mockRejectedValue(new Error('MFA required'));
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('includes the Delhi drafts and fixed private NCRTC candidate only after MFA', async () => {
    mocks.admin.mockResolvedValue({});
    mocks.read.mockResolvedValue('Owner-only dossier');
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.json();
    expect(body.requests.map((r: { name: string }) => r.name)).toContain(
      'delhi-ser2-record-request.md',
    );
    expect(body.requests.map((r: { name: string }) => r.name)).toContain(
      'delhi-ncrtc-payment-candidate.md',
    );
    expect(mocks.read).toHaveBeenCalledWith(
      expect.stringContaining('/data/acquisition/delhi-ncrtc-research/README.md'),
      'utf8',
    );
  });
  it('reports missing original/dossier files as unavailable', async () => {
    mocks.admin.mockResolvedValue({});
    mocks.read.mockRejectedValue(new Error('Missing file'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Request dossier unavailable' });
  });
});
