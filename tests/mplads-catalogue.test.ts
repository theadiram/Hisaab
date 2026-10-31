import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), catalogue: vi.fn() }));
vi.mock('@/lib/admin', () => ({ requireAdmin: mocks.admin }));
vi.mock('@/lib/mplads-catalogue', () => ({ catalogue: mocks.catalogue }));
import { GET } from '../src/app/api/v1/admin/mplads-catalogue/route';
const url = 'http://localhost/api/v1/admin/mplads-catalogue';
describe('nationwide source catalogue access', () => {
  beforeEach(() => vi.resetAllMocks());
  it('requires owner MFA before opening the private catalogue', async () => {
    mocks.admin.mockRejectedValue(new Error('MFA'));
    expect((await GET(new Request(url))).status).toBe(401);
    expect(mocks.catalogue).not.toHaveBeenCalled();
  });
  it.each(['?house=0', '?page=0', '?project=../../private'])(
    'rejects unsupported scopes and paths %s',
    async (q) => {
      mocks.admin.mockResolvedValue({});
      expect((await GET(new Request(url + q))).status).toBe(400);
      expect(mocks.catalogue).not.toHaveBeenCalled();
    },
  );
  it('passes exact scoped identity and paginates source rows privately', async () => {
    mocks.admin.mockResolvedValue({});
    mocks.catalogue.mockReturnValue({ rows: [], total: 0 });
    const response = await GET(new Request(url + '?project=1%3AWS%2FMP1%2F2025-2026%2F7&page=2'));
    expect(response.status).toBe(200);
    expect(mocks.catalogue).toHaveBeenCalledWith('', '', '', 2, '1:WS/MP1/2025-2026/7');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('reports unavailable evidence instead of empty coverage', async () => {
    mocks.admin.mockResolvedValue({});
    mocks.catalogue.mockImplementation(() => {
      throw new Error('Missing database');
    });
    expect((await GET(new Request(url))).status).toBe(503);
  });
});
