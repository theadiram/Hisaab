import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/admin', () => ({ requireAdmin: mocks.admin }));
vi.mock('node:fs/promises', () => ({ readFile: mocks.read }));
import { GET } from '../src/app/api/v1/admin/bank-evidence/route';
describe('private payment evidence', () => {
  beforeEach(() => vi.resetAllMocks());
  it('requires owner MFA before reading any evidence', async () => {
    mocks.admin.mockRejectedValue(new Error('MFA required'));
    const response = await GET(new Request('http://localhost/api/v1/admin/bank-evidence'));
    expect(response.status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('pages records and exposes only reviewed display fields, without assigning projects', async () => {
    mocks.admin.mockResolvedValue({});
    const records = Array.from({ length: 60 }, (_, i) => ({
      id: String(i),
      billNumber: 'Bill ' + i,
      implementingUnit: 'Anandapur',
      chequeAmount: '123.00',
      projectId: 'unverified-input',
      payee: 'unverified-input',
      bankAccount: 'excluded',
      approved: true,
    }));
    mocks.read.mockImplementation((file: string) =>
      Promise.resolve(
        file.endsWith('.jsonl')
          ? records.map((r) => JSON.stringify(r)).join('\n')
          : JSON.stringify({ documentHash: 'official' }),
      ),
    );
    const response = await GET(
      new Request('http://localhost/api/v1/admin/bank-evidence?page=2&q=anandapur'),
    );
    const body = await response.json();
    expect(body.total).toBe(60);
    expect(body.records).toHaveLength(25);
    expect(body.records[0].id).toBe('25');
    expect(body.records[0]).toMatchObject({ projectId: null, payee: null, approved: false });
    expect(JSON.stringify(body)).not.toContain('excluded');
  });
  it('rejects invalid pagination without reading originals', async () => {
    mocks.admin.mockResolvedValue({});
    const response = await GET(new Request('http://localhost/api/v1/admin/bank-evidence?page=-1'));
    expect(response.status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
