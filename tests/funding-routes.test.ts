import { beforeEach, describe, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ read: vi.fn(), admin: vi.fn(), rpc: vi.fn(), history: vi.fn() }));
vi.mock('@/lib/funding-db', () => ({
  publishedFunding: m.read,
  publishedFundingHistory: m.history,
}));
vi.mock('@/lib/admin', () => ({ requireAdmin: m.admin }));
import { GET as programmeHistory } from '../src/app/api/v1/funding/programmes/[id]/route';
import { GET } from '../src/app/api/v1/funding/route';
import { POST as draft } from '../src/app/api/v1/admin/funding/budget-draft/route';
import { GET as owner } from '../src/app/api/v1/admin/funding/route';
describe('funding public/privacy boundaries', () => {
  beforeEach(() => vi.resetAllMocks());
  it('rejects invalid filters before touching storage', async () => {
    expect((await GET(new Request('http://localhost/api/v1/funding?measure=payment'))).status).toBe(
      400,
    );
    expect(m.read).not.toHaveBeenCalled();
  });
  it('returns unavailable on source/database failures', async () => {
    m.read.mockRejectedValue(new Error('offline'));
    const r = await GET(new Request('http://localhost/api/v1/funding'));
    expect(r.status).toBe(503);
    expect(await r.json()).not.toHaveProperty('amountRupees', '0.00');
  });
  it('returns 36 explicit unknowns for a working, empty reviewed catalogue', async () => {
    m.read.mockResolvedValue([]);
    const r = await GET(new Request('http://localhost/api/v1/funding'));
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.states).toHaveLength(36);
    expect(d.national.amountRupees).toBeNull();
    expect(d.coverage.complete).toBe(false);
  });
  it('checks MFA before reading the private funding queue', async () => {
    m.admin.mockRejectedValue(new Error('aal1'));
    const r = await owner(new Request('http://localhost/api/v1/admin/funding'));
    expect(r.status).toBe(401);
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it('rejects cross-origin budget drafts before touching private storage', async () => {
    const r = await draft(
      new Request('http://localhost/api/v1/admin/funding/budget-draft', {
        method: 'POST',
        headers: { origin: 'https://outside.invalid' },
      }),
    );
    expect(r.status).toBe(403);
    expect(m.admin).not.toHaveBeenCalled();
  });
  it('requires owner MFA before parsing a private draft', async () => {
    m.admin.mockRejectedValue(new Error('aal1'));
    const r = await draft(
      new Request('http://localhost/api/v1/admin/funding/budget-draft', {
        method: 'POST',
        headers: { origin: 'http://localhost' },
        body: '{}',
      }),
    );
    expect(r.status).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it('rejects malformed private draft fields before calling the database', async () => {
    m.admin.mockResolvedValue({ client: { rpc: m.rpc } });
    const r = await draft(
      new Request('http://localhost/api/v1/admin/funding/budget-draft', {
        method: 'POST',
        headers: { origin: 'http://localhost' },
        body: JSON.stringify({ rowId: 'row', column: 3, bankAccount: 'private' }),
      }),
    );
    expect(r.status).toBe(400);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it('supports national programme history without invented state allocations', async () => {
    m.history.mockResolvedValue([]);
    const r = await programmeHistory(
      new Request('http://localhost/api/v1/funding/programmes/SDRF?scope=national'),
      { params: Promise.resolve({ id: 'SDRF' }) },
    );
    expect(r.status).toBe(200);
    expect(m.history).toHaveBeenCalledWith('national', 'SDRF');
    expect(await r.json()).toMatchObject({ history: [], complete: false });
  });
  it('rejects unknown programme jurisdictions before reading evidence', async () => {
    const r = await programmeHistory(
      new Request('http://localhost/api/v1/funding/programmes/SDRF?scope=99'),
      { params: Promise.resolve({ id: 'SDRF' }) },
    );
    expect(r.status).toBe(400);
    expect(m.history).not.toHaveBeenCalled();
  });
});
