import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../src/lib/admin', () => ({ requireAdmin: vi.fn() }));
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
import { requireAdmin } from '../src/lib/admin';
import { readFile } from 'node:fs/promises';
import { GET } from '../src/app/api/v1/admin/state-development/route';
import { GET as publicProgress } from '../src/app/api/v1/evidence-progress/route';
beforeEach(() => {
  vi.resetAllMocks();
});
describe('private two-year state evidence', () => {
  it('exposes eight-UT progress counts without private evidence fields', async () => {
    vi.mocked(readFile)
      .mockResolvedValueOnce(JSON.stringify({ tasks: [] }))
      .mockResolvedValueOnce(JSON.stringify({ states: [] }))
      .mockResolvedValueOnce(
        JSON.stringify({
          states: [
            {
              code: '35',
              name: 'Andaman and Nicobar Islands',
              projectCandidates: 25,
              amountRupees: 'PRIVATE_AMOUNT',
              contractorName: 'PRIVATE_PERSON',
              source: { url: 'https://example.invalid/private-source' },
            },
          ],
        }),
      );
    const response = await publicProgress();
    const body = await response.json();
    expect(body.unionTerritoryDevelopmentCollection.states[0].projectCandidates).toBe(25);
    expect(JSON.stringify(body)).not.toContain('PRIVATE_AMOUNT');
    expect(JSON.stringify(body)).not.toContain('PRIVATE_PERSON');
    expect(JSON.stringify(body)).not.toContain('private-source');
  });
  it('keeps UT cards in their separate eight-territory register behind owner MFA', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as Awaited<ReturnType<typeof requireAdmin>>);
    vi.mocked(readFile)
      .mockResolvedValueOnce(
        JSON.stringify({ states: [{ code: '35', name: 'Andaman and Nicobar Islands' }] }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          projectCandidates: [
            {
              id: 'ut-project',
              stateCode: '35',
              title: 'Official project record',
              stage: 'Ongoing',
              paymentAmountRupees: null,
              source: { url: 'https://example.gov.in/register', locator: 'Row 1' },
            },
          ],
        }),
      )
      .mockRejectedValueOnce(Object.assign(new Error('No comparison'), { code: 'ENOENT' }));
    const response = await GET(
      new Request('http://localhost/api?state=35&register=territories&section=cards'),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.state.code).toBe('35');
    expect(body.rows[0].card.publicationApproved).toBe(false);
    expect(vi.mocked(readFile).mock.calls[0][0]).toEqual(
      expect.stringContaining('union-territory-development-acquisition.json'),
    );
    expect(vi.mocked(readFile).mock.calls[1][0]).toEqual(
      expect.stringContaining('union-territory-development/35/candidates.json'),
    );
  });
  it('serves partial project cards privately without promoting source candidates or disclosing raw fields', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as Awaited<ReturnType<typeof requireAdmin>>);
    vi.mocked(readFile)
      .mockResolvedValueOnce(JSON.stringify({ states: [{ code: '18', name: 'Assam' }] }))
      .mockResolvedValueOnce(
        JSON.stringify({
          projectCandidates: [
            {
              id: 'project',
              title: 'Source road',
              stateCode: '18',
              stage: 'Ongoing',
              contractAmountRupees: '1000.00',
              paymentAmountRupees: '900.00',
              publicationApproved: true,
              bankAccount: 'SECRET_ACCOUNT',
              original: '/private/original',
              source: { url: 'https://example.gov.in/report', locator: 'Page 1' },
            },
          ],
        }),
      )
      .mockRejectedValueOnce(Object.assign(new Error('Not collected'), { code: 'ENOENT' }));
    const response = await GET(new Request('http://localhost/api?state=18&section=cards'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.rows[0].card.contractAmountRupees).toBe('1000.00');
    expect(body.rows[0].card.publicationApproved).toBe(false);
    expect(body.rows[0].card.paymentEvidence).toBe('not_reviewed');
    expect(JSON.stringify(body)).not.toContain('SECRET_ACCOUNT');
    expect(JSON.stringify(body)).not.toContain('/private/original');
    expect(body.rows[0].card).not.toHaveProperty('paymentAmountRupees');
  });
  it('keeps reconciliation behind MFA and does not turn matched arithmetic into approval', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as Awaited<ReturnType<typeof requireAdmin>>);
    vi.mocked(readFile)
      .mockResolvedValueOnce(JSON.stringify({ states: [{ code: '28', name: 'Andhra Pradesh' }] }))
      .mockResolvedValueOnce(
        JSON.stringify({
          checkedAt: '2026-10-12',
          identityCheck: 'unique',
          completeCoverage: true,
          publicationApproved: true,
          original: 'private/original',
          tableControls: [{ status: 'matched', differenceRupees: '0.00' }],
        }),
      );
    const r = await GET(new Request('http://localhost/api?state=28&section=reconciliation'));
    const b = await r.json();
    expect(b.rows[0].completeCoverage).toBe(false);
    expect(b.rows[0].publicationApproved).toBe(false);
    expect(b.approved).toBe(false);
    expect(JSON.stringify(b)).not.toContain('private/original');
  });
  it('keeps classification suggestions private, paginated and unapproved', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as Awaited<ReturnType<typeof requireAdmin>>);
    vi.mocked(readFile)
      .mockResolvedValueOnce(JSON.stringify({ states: [{ code: '17', name: 'Meghalaya' }] }))
      .mockResolvedValueOnce(
        JSON.stringify({
          rows: [{ id: 'suggestion', decision: 'mixed_unresolved', publicationApproved: false }],
        }),
      );
    const r = await GET(new Request('http://localhost/api?state=17&section=classification'));
    const b = await r.json();
    expect(r.status).toBe(200);
    expect(b.approved).toBe(false);
    expect(b.rows[0].decision).toBe('mixed_unresolved');
    expect(r.headers.get('cache-control')).toBe('private, no-store');
  });
  it('rejects an unauthenticated request before reading private files', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('MFA required'));
    const r = await GET(new Request('http://localhost/api?state=28'));
    expect(r.status).toBe(401);
    expect(readFile).not.toHaveBeenCalled();
    expect(r.headers.get('cache-control')).toBe('private, no-store');
  });
  it('rejects path traversal, repeated and unknown query fields', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as Awaited<ReturnType<typeof requireAdmin>>);
    for (const q of [
      'state=../28',
      'state=28&state=12',
      'state=28&section=raw',
      'state=28&page=-1',
      'state=28&bank=all',
    ]) {
      const r = await GET(new Request('http://localhost/api?' + q));
      expect(r.status).toBe(400);
    }
    expect(readFile).not.toHaveBeenCalled();
  });
  it('paginates private sources without exposing local paths or originals', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as Awaited<ReturnType<typeof requireAdmin>>);
    const docs = Array.from({ length: 27 }, (_, i) => ({
      sourceId: String(i),
      url: 'https://example.invalid/report',
      original: 'private/original',
      extraction: 'private/data',
      sha256: 'a'.repeat(64),
    }));
    vi.mocked(readFile)
      .mockResolvedValueOnce(JSON.stringify({ states: [{ code: '28', name: 'Andhra Pradesh' }] }))
      .mockResolvedValueOnce(JSON.stringify({ documents: docs }));
    const r = await GET(new Request('http://localhost/api?state=28&page=2'));
    const b = await r.json();
    expect(b.total).toBe(27);
    expect(b.rows).toHaveLength(2);
    expect(b.approved).toBe(false);
    expect(JSON.stringify(b)).not.toContain('private/original');
    expect(JSON.stringify(b)).not.toContain('private/data');
  });
  it('keeps missing normalized records empty rather than inventing zero spending', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as Awaited<ReturnType<typeof requireAdmin>>);
    vi.mocked(readFile)
      .mockResolvedValueOnce(JSON.stringify({ states: [{ code: '28', name: 'Andhra Pradesh' }] }))
      .mockRejectedValueOnce(Object.assign(new Error('Missing'), { code: 'ENOENT' }));
    const r = await GET(new Request('http://localhost/api?state=28&section=budget'));
    const b = await r.json();
    expect(b.rows).toEqual([]);
    expect(b).not.toHaveProperty('amountRupees');
  });
  it('projects public collection counts without private financial evidence', async () => {
    vi.mocked(readFile)
      .mockResolvedValueOnce(JSON.stringify({ tasks: [] }))
      .mockResolvedValueOnce(
        JSON.stringify({
          financialYears: ['2025-2026', '2026-2027'],
          originals: 3,
          pdfs: 2,
          budgetCandidates: 1,
          states: [
            {
              code: '28',
              name: 'Andhra Pradesh',
              order: 1,
              originals: 3,
              pdfs: 2,
              budgetCandidates: 1,
              nextAction: 'Review source headers',
              amountRupees: '123456.00',
              contractorName: 'Private candidate',
              original: 'private/path',
              source: { url: 'https://example.invalid/private-evidence' },
            },
          ],
        }),
      );
    vi.mocked(readFile).mockRejectedValue(
      Object.assign(new Error('Optional UT summary absent'), { code: 'ENOENT' }),
    );
    const r = await publicProgress();
    const b = await r.json();
    expect(b.stateDevelopmentCollection.states[0].budgetCandidates).toBe(1);
    expect(JSON.stringify(b)).not.toContain('123456.00');
    expect(JSON.stringify(b)).not.toContain('Private candidate');
    expect(JSON.stringify(b)).not.toContain('private/path');
    expect(JSON.stringify(b)).not.toContain('private-evidence');
  });
});
