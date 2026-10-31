import { describe, it, expect } from 'vitest';
import { reviewedRoadFacts } from '../src/lib/road-preview-review';
import type { Work } from '../src/lib/model';

function fixture(): Work {
  const receipt = {
    id: 'test-receipt',
    title: 'Synthetic report',
    url: 'https://example.invalid/report',
    documentHash: 'a'.repeat(64),
    locator: 'Test row 1',
    retrievedAt: '2026-10-25',
    rawText: 'Synthetic source dates.',
    permission: 'Pending test basis',
  };
  return {
    id: 'test-road',
    title: 'Synthetic road',
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
    physicalVerification: 'Actual site not independently verified.',
    summary: 'Synthetic source record.',
    money: [],
    stages: ['sanction', 'award', 'payment', 'completion'].map((id) => ({
      id,
      label: id,
      state: 'pending',
      reviewStatus: 'pending',
      date: ['sanction', 'award'].includes(id) ? '2025-05-01' : null,
      amount: null,
      description: 'Test-only reported date.',
      receipts: ['sanction', 'award'].includes(id) ? [receipt] : [],
    })),
  };
}
describe('narrow road preview review', () => {
  it('requires rights for the exact checksum and URL before marking source dates reviewed', () => {
    expect(() => reviewedRoadFacts(fixture(), new Map())).toThrow('exact cited original');
    expect(() =>
      reviewedRoadFacts(
        fixture(),
        new Map([['a'.repeat(64) + '|https://example.invalid/different', 'Reviewed basis']]),
      ),
    ).toThrow();
    const result = reviewedRoadFacts(
      fixture(),
      new Map([
        [
          'a'.repeat(64) + '|https://example.invalid/report',
          'Explicit document-specific source rights basis',
        ],
      ]),
    );
    expect(
      result.stages.slice(0, 2).every((s) => s.state === 'found' && s.reviewStatus === 'verified'),
    ).toBe(true);
    expect(
      result.stages
        .slice(2)
        .every(
          (s) => s.state === 'inaccessible' && s.reviewStatus === 'pending' && !s.receipts.length,
        ),
    ).toBe(true);
    expect(result.money).toEqual([]);
    expect(result.physicalVerification).toContain('not independently verified');
  });
  it('rejects amount-bearing stage approval and increased site precision', () => {
    const work = fixture();
    work.stages[0].amount = '100.00';
    expect(() => reviewedRoadFacts(work, new Map())).toThrow('unknown amounts');
    expect(() =>
      reviewedRoadFacts({ ...fixture(), locationPrecision: 'address' }, new Map()),
    ).toThrow('scope');
  });
});
