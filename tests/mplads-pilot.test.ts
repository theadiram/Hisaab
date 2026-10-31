import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/admin', () => ({ requireAdmin: mocks.admin }));
vi.mock('node:fs/promises', () => ({ readFile: mocks.read }));
import { GET } from '../src/app/api/v1/admin/mplads-pilot/route';
import { pilotCards } from '../src/lib/mplads-pilot';
const url = 'http://localhost/api/v1/admin/mplads-pilot';
describe('MPLADS private pilot receipts', () => {
  beforeEach(() => vi.resetAllMocks());
  it('does not promote source assertions to approval, coordinates or settlement', () => {
    const cards = pilotCards({
      cases: [
        {
          recommendationId: 1,
          approved: true,
          coordinates: [1, 2],
          bankSettlementVerified: true,
          bankAccount: 'private',
          sourceExpenditureRows: [{ FUND_DISBURSED_AMT: '200000', bankAccount: 'private' }],
        },
      ],
    });
    expect(cards[0]).toMatchObject({
      approved: false,
      coordinates: null,
      bankSettlementVerified: false,
    });
    expect(JSON.stringify(cards)).not.toContain('private');
  });
  it.each(['', '?document=' + 'a'.repeat(64)])(
    'requires MFA before reading receipts or documents %s',
    async (query) => {
      mocks.admin.mockRejectedValue(new Error('MFA required'));
      expect((await GET(new Request(url + query))).status).toBe(401);
      expect(mocks.read).not.toHaveBeenCalled();
    },
  );
  it('rejects traversal before reading evidence', async () => {
    mocks.admin.mockResolvedValue({});
    expect((await GET(new Request(url + '?document=../secret'))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('serves only registered checksum-verified documents with private caching', async () => {
    mocks.admin.mockResolvedValue({});
    const bytes = Buffer.from('%PDF-1.7\ntest');
    const hash = createHash('sha256').update(bytes).digest('hex');
    mocks.read.mockImplementation((p: string) =>
      Promise.resolve(
        p.endsWith('pilot-review.json')
          ? JSON.stringify({
              cases: [
                {
                  documents: [
                    { binarySha256: hash, binaryFile: hash + '.pdf', sourceFilename: 'bill.pdf' },
                  ],
                },
              ],
            })
          : bytes,
      ),
    );
    const response = await GET(new Request(url + '?document=' + hash));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect((await GET(new Request(url + '?document=' + '0'.repeat(64)))).status).toBe(404);
    mocks.read.mockImplementation((p: string) =>
      Promise.resolve(
        p.endsWith('pilot-review.json')
          ? JSON.stringify({
              cases: [{ documents: [{ binarySha256: hash, binaryFile: hash + '.pdf' }] }],
            })
          : Buffer.from('%PDF-tampered'),
      ),
    );
    expect((await GET(new Request(url + '?document=' + hash))).status).toBe(503);
  });
});
