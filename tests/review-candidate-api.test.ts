import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/lib/admin', () => ({ requireAdmin: vi.fn() }));
import { requireAdmin } from '../src/lib/admin';
import { GET } from '../src/app/api/v1/admin/review/route';
import { compareIntakeProject } from '../src/lib/intake-project-comparison';
import type { Work } from '../src/lib/model';
import { workSchema } from '../src/lib/validation';

const rpc = vi.fn();
function candidate(): Work {
  return {
    id: 'synthetic-pending-1',
    title: 'Synthetic pending road',
    purpose: 'Roads',
    state: 'Odisha',
    district: 'Test district',
    areaId: 'district:test',
    financialYear: '2025-2026',
    officialIds: ['TEST-1'],
    location: [83, 20],
    locationPrecision: 'source_point',
    authority: null,
    authorityReceipt: null,
    physicalVerification: 'Documentary route only; no independent field check.',
    summary: 'Test fixture.',
    money: [],
    stages: ['sanction', 'award', 'payment', 'completion'].map((id) => ({
      id,
      label: id,
      state: 'pending',
      reviewStatus: 'pending',
      date: null,
      amount: null,
      description: 'Unknown until evidence review.',
      receipts: [],
    })),
  };
}
const request = (query = 'id=synthetic-pending-1') =>
  new Request('http://localhost/api/v1/admin/review?' + query);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ client: { rpc } } as unknown as Awaited<
    ReturnType<typeof requireAdmin>
  >);
});

describe('exact pending candidate inspection', () => {
  it('can inspect an unreconciled original without relaxing publication validation', async () => {
    const original = { ...candidate(), areaId: '' };
    rpc.mockResolvedValue({ data: original });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).candidate.areaId).toBe('');
    expect(workSchema.safeParse(original).success).toBe(false);
    expect(
      compareIntakeProject(candidate(), original).differences.some((d) => d.field === 'areaId'),
    ).toBe(true);
  });
  it('requires MFA before input inspection or database access', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('MFA required'));
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('looks up one exact ID and strips non-Work private metadata', async () => {
    rpc.mockResolvedValue({
      data: {
        ...candidate(),
        sourceDocument: { storagePath: 'PRIVATE_STORAGE' },
        query_manifest: 'PRIVATE_MANIFEST',
      },
    });
    const response = await GET(request()),
      body = await response.json();
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('admin_candidate', { p_id: 'synthetic-pending-1' });
    expect(body.candidate).toEqual(candidate());
    expect(JSON.stringify(body)).not.toContain('PRIVATE_');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('rejects repeated, mixed, missing, oversized and invalid exact IDs', async () => {
    for (const query of [
      'id=',
      'id=../source',
      'id=one&id=two',
      'id=one&q=search',
      'id=one&offset=0',
      'id=one&raw=true',
      'id=%00',
      'id=' + 'a'.repeat(241),
    ])
      expect((await GET(request(query))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('does not fabricate a candidate when an ID is unprepared or already published', async () => {
    rpc.mockResolvedValue({ data: null });
    expect((await GET(request())).status).toBe(404);
  });
  it('fails closed if the backend returns a different identity or invalid work', async () => {
    rpc
      .mockResolvedValueOnce({ data: { ...candidate(), id: 'another-candidate' } })
      .mockResolvedValueOnce({ data: { id: 'synthetic-pending-1' } });
    expect((await GET(request())).status).toBe(503);
    expect((await GET(request())).status).toBe(503);
  });
  it('handles backend outage without returning a false candidate', async () => {
    rpc.mockRejectedValue(new Error('Network failed'));
    expect((await GET(request())).status).toBe(503);
  });
  it('preserves the existing paginated review queue path', async () => {
    rpc.mockResolvedValue({ data: { candidates: [], total: 0 } });
    const response = await GET(request('q=roads&offset=100'));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('admin_candidates_page', {
      p_offset: 100,
      p_limit: 100,
      p_query: 'roads',
    });
  });
});

describe('explicit pending intake comparison', () => {
  it('shows authority, narrative and stage meaning changes instead of hiding them', () => {
    const before = candidate(),
      proposed = candidate();
    proposed.authority = 'Source-reported departmental execution office';
    proposed.summary = 'Changed narrow source claim';
    proposed.stages[0].description = 'Changed approval-date interpretation';
    const comparison = compareIntakeProject(proposed, before);
    expect(comparison.differences.map((d) => d.field)).toEqual(
      expect.arrayContaining(['authority', 'summary', 'stages']),
    );
    expect(comparison.publicationApproved).toBe(false);
  });
  it('shows exact identity, coordinate, year and stage-source differences without approval', () => {
    const before = candidate(),
      proposed = candidate();
    proposed.location = [83.1, 20.1];
    proposed.financialYear = '2026-2027';
    proposed.stages[0].receipts = [
      {
        id: 'test-receipt',
        title: 'Test geometry source',
        url: 'https://example.invalid/route',
        documentHash: 'a'.repeat(64),
        locator: 'Feature TEST-1',
        retrievedAt: '2026-10-25',
        rawText: 'Test only.',
        permission: 'Unreviewed',
      },
    ];
    const comparison = compareIntakeProject(proposed, before);
    expect(comparison.canReconcile).toBe(true);
    expect(comparison.publicationApproved).toBe(false);
    expect(comparison.differences.map((d) => d.field)).toEqual(
      expect.arrayContaining(['location', 'financialYear', 'stages']),
    );
    expect(proposed.stages[0].reviewStatus).toBe('pending');
  });
  it('holds any already found or verified stage for the main owner console', () => {
    for (const mode of ['found', 'verified']) {
      const current = candidate();
      if (mode === 'found') current.stages[0].state = 'found';
      else current.stages[0].reviewStatus = 'verified';
      if (mode === 'found')
        current.stages[0].receipts = [
          {
            id: 'source',
            title: 'Synthetic fixture',
            url: 'https://example.invalid/source',
            documentHash: 'a'.repeat(64),
            locator: 'Test',
            retrievedAt: '2026-10-25',
            rawText: 'Test',
            permission: 'Test',
          },
        ];
      expect(compareIntakeProject(candidate(), current).canReconcile).toBe(false);
    }
  });
  it('holds approved money even when its stage has not been reviewed', () => {
    const current = candidate();
    current.money = [
      {
        id: 'money-1',
        measure: 'contract',
        amount: '1.00',
        kind: 'transaction',
        canonicalId: 'test-1',
        date: null,
        receiptId: 'r',
        originalAmount: '1',
        originalUnit: 'rupees',
        approved: true,
      },
    ];
    current.stages[1].receipts = [
      {
        id: 'r',
        title: 'Test',
        url: 'https://example.invalid/source',
        documentHash: 'a'.repeat(64),
        locator: 'Test',
        retrievedAt: '2026-10-25',
        rawText: 'Test',
        permission: 'Test',
      },
    ];
    expect(compareIntakeProject(candidate(), current).canReconcile).toBe(false);
  });
  it('rejects a different project ID and any approved intake replacement', () => {
    const proposed = candidate();
    proposed.id = 'different-id';
    expect(compareIntakeProject(proposed, candidate()).canReconcile).toBe(false);
    proposed.id = candidate().id;
    proposed.stages[0].reviewStatus = 'verified';
    expect(compareIntakeProject(proposed, candidate()).canReconcile).toBe(false);
  });
});
