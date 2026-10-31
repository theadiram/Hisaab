import { describe, expect, it } from 'vitest';
import { firstDotOwnerReviewPlan } from '../src/lib/first-dot-owner-review-plan';

function fixture() {
  const source = (id: string, hash: string) => ({
    id,
    name: 'Synthetic review source',
    family: 'Test',
    hash,
    url: `https://example.invalid/${id}`,
    storagePath: `${id}/${hash}`,
    contentType: 'application/pdf',
    retrievedAt: '2026-10-25T10:00:00Z',
    reuseBasis: 'Unreviewed test basis',
  });
  const sources = [source('test-project', 'a'.repeat(64)), source('test-geometry', 'b'.repeat(64))];
  const ref = (index: number) => ({
    hash: sources[index].hash,
    url: sources[index].url,
    locator: 'Synthetic test page 1',
  });
  return {
    version: 'hisaab-intake/1',
    batchId: 'synthetic-batch',
    jurisdiction: '21',
    cutoff: '2026-10-25',
    sources,
    projects: [
      {
        id: 'synthetic-work',
        title: 'Synthetic pending work',
        purpose: 'Roads',
        state: 'Odisha',
        district: 'Synthetic district',
        areaId: 'district:test',
        financialYear: '2025-2026',
        officialIds: ['TEST-1'],
        location: [83, 20],
        locationPrecision: 'source_point',
        authority: null,
        authorityReceipt: null,
        summary: 'Test only.',
        physicalVerification: 'Unverified source route.',
        money: [],
        stages: ['sanction', 'award', 'payment', 'completion'].map((id) => ({
          id,
          label: id,
          state: 'pending',
          reviewStatus: 'pending',
          amount: null,
          date: null,
          description: 'Unknown until review.',
          receipts:
            id === 'sanction'
              ? [
                  {
                    id: 'receipt-1',
                    title: 'Synthetic source',
                    url: sources[0].url,
                    documentHash: sources[0].hash,
                    locator: 'Synthetic test page 1',
                    retrievedAt: '2026-10-25',
                    rawText: 'Synthetic source claim.',
                    permission: 'Test only.',
                  },
                ]
              : [],
        })),
      },
    ],
    assets: [
      {
        id: 'synthetic-asset',
        projectId: 'synthetic-work',
        assetId: 'source:test',
        matchBasis: 'official_id',
        location: [83, 20],
        precision: 'source_point',
        geometry: null,
        sourceRefs: [ref(1)],
      },
    ],
    coverage: {
      denominator: null,
      denominatorSource: null,
      years: ['2025-2026'],
      missing: ['Owner review pending.'],
      nextAction: 'Review.',
      checkpoint: 'Synthetic test.',
    },
  };
}

describe('private owner review plan', () => {
  it('lists secondary geometry rights separately and never makes an approval', () => {
    const plan = firstDotOwnerReviewPlan(fixture());
    expect(plan.projectCount).toBe(1);
    expect(plan.distinctSourceDocuments).toBe(2);
    expect(plan.ownerMfaRequired).toBe(true);
    expect(plan.publicationApproved).toBe(false);
    const work = plan.projects[0];
    expect(work.sourceDocuments.every((d) => d.documentRightsDecisionRequired)).toBe(true);
    expect(work.publicationBlocked).toBe(true);
    expect(work.documentarySiteAssociationDecisionRequired).toBe(true);
    expect(work.independentPhysicalVerificationAssessed).toBe(false);
  });

  it('only offers stage review when receipts exist', () => {
    const stages = firstDotOwnerReviewPlan(fixture()).projects[0].stageChoices;
    expect(stages.find((s) => s.id === 'sanction')?.canBeConsideredForEvidenceReview).toBe(true);
    expect(stages.find((s) => s.id === 'payment')?.canBeConsideredForEvidenceReview).toBe(false);
  });

  it('rejects a source reference that is not preserved in the package', () => {
    const batch = fixture();
    batch.assets[0].sourceRefs[0].hash = 'c'.repeat(64);
    expect(() => firstDotOwnerReviewPlan(batch)).toThrow('preserved source');
  });

  it('rejects collector packages which mark evidence as already verified', () => {
    const batch = fixture();
    batch.projects[0].stages[0].reviewStatus = 'verified';
    expect(() => firstDotOwnerReviewPlan(batch)).toThrow('Agents cannot approve');
  });

  it('rejects a malformed candidate instead of presenting an actionable checklist', () => {
    expect(() => firstDotOwnerReviewPlan({ projects: [{ id: 'bad' }] })).toThrow();
  });
});
