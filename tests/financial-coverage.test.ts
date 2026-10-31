import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ catalogue: vi.fn(), db: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/lib/catalogue', () => ({ readCatalogue: mocks.catalogue }));
vi.mock('../src/lib/public-db', () => ({ publicDb: mocks.db }));
import { financialCoverage } from '../src/lib/financial-coverage';
describe('financial coverage', () => {
  beforeEach(() => vi.resetAllMocks());
  it('counts cumulative expenditure as finance but not an individual payment', async () => {
    mocks.catalogue.mockResolvedValue({
      mode: 'local',
      publishedAt: null,
      works: [
        {
          money: [
            { approved: true, receiptId: 'official', measure: 'payment', kind: 'cumulative' },
          ],
          stages: [],
        },
        {
          money: [
            { approved: true, receiptId: 'official', measure: 'payment', kind: 'transaction' },
          ],
          stages: [{ id: 'payment', state: 'found' }],
        },
        {
          money: [
            { approved: false, receiptId: 'official', measure: 'payment', kind: 'transaction' },
          ],
          stages: [],
        },
        {
          money: [{ approved: true, receiptId: null, measure: 'payment', kind: 'transaction' }],
          stages: [],
        },
      ],
    });
    expect(await financialCoverage()).toMatchObject({
      publishedWorks: 4,
      withFinancialRecords: 2,
      withPaymentDetails: 1,
      missingStages: { payment: 3, sanction: 4 },
    });
  });
  it('uses exact database counts across pages and excludes cumulative payment kinds', async () => {
    mocks.catalogue.mockResolvedValue({
      mode: 'supabase',
      totalWorks: 1200,
      works: [],
      publishedAt: '2026-10-07',
    });
    const counts = [1000, 600, 1100, 1000, 700, 500],
      filters: string[] = [];
    mocks.db.mockReturnValue({
      from: () => ({
        select: (_column: string, options: unknown) => {
          expect(options).toEqual({ count: 'exact', head: true });
          return {
            or: (f: string) => {
              filters.push(f);
              return Promise.resolve({ count: counts.shift(), error: null });
            },
            contains: () => Promise.resolve({ count: counts.shift(), error: null }),
          };
        },
      }),
    });
    expect(await financialCoverage()).toMatchObject({
      publishedWorks: 1200,
      withFinancialRecords: 1000,
      withPaymentDetails: 600,
      missingStages: { sanction: 100, award: 200, payment: 500, completion: 700 },
    });
    expect(filters[1]).toContain('transaction');
    expect(filters[1]).toContain('reversal');
    expect(filters[1]).not.toContain('cumulative');
  });
  it('fails visibly when financial counts are unavailable instead of reporting zero', async () => {
    mocks.catalogue.mockResolvedValue({ mode: 'supabase', totalWorks: 10, works: [] });
    mocks.db.mockReturnValue({
      from: () => ({
        select: () => ({
          or: () => Promise.resolve({ count: null, error: { message: 'Unavailable' } }),
          contains: () => Promise.resolve({ count: null, error: null }),
        }),
      }),
    });
    await expect(financialCoverage()).rejects.toThrow('Financial evidence counts unavailable');
  });
});
