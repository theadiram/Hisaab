import { describe, expect, it } from 'vitest';
import { workSchema } from '../src/lib/validation';
import { assertPublicationEvidence } from '../src/lib/publication-evidence';
import type { Work } from '../src/lib/model';
import {
  assessPublicationReviewReadiness,
  type PublicationReviewContext,
} from '../src/lib/publication-review-readiness';

// Synthetic validation fixture only; never an acquired government record.
function contractOnly(): Work {
  const receipt = {
    id: 'contract-source',
    title: 'Synthetic source fixture',
    url: 'https://example.invalid/contract.pdf',
    documentHash: 'a'.repeat(64),
    locator: 'Test page 1',
    retrievedAt: '2026-10-25',
    rawText: 'Synthetic contract evidence.',
    permission: 'Test only',
  };
  return {
    id: 'synthetic-contract-work',
    title: 'Synthetic ongoing work',
    purpose: 'Roads',
    state: 'Synthetic state',
    district: 'Synthetic district',
    areaId: 'synthetic-area',
    financialYear: '2026-2027',
    officialIds: ['SYNTHETIC-1'],
    location: [80, 20],
    locationPrecision: 'source_point',
    authority: null,
    authorityReceipt: null,
    physicalVerification: 'No independent physical verification.',
    summary: 'Contract evidenced; payment and completion evidence remain unavailable.',
    stages: [
      {
        id: 'sanction',
        label: 'Sanction',
        state: 'missing',
        amount: null,
        date: null,
        description: 'Unknown.',
        receipts: [],
      },
      {
        id: 'award',
        label: 'Contract',
        state: 'found',
        reviewStatus: 'verified',
        amount: '100000.00',
        date: '2026-04-01',
        description: 'Synthetic reviewed award.',
        receipts: [receipt],
      },
      {
        id: 'payment',
        label: 'Payment',
        state: 'missing',
        amount: null,
        date: null,
        description: 'Unknown.',
        receipts: [],
      },
      {
        id: 'completion',
        label: 'Completion',
        state: 'pending',
        amount: null,
        date: null,
        description: 'Not established.',
        receipts: [],
      },
    ],
    money: [
      {
        id: 'contract-1',
        canonicalId: 'synthetic:contract-1',
        measure: 'contract',
        kind: 'transaction',
        amount: '100000.00',
        originalAmount: '1',
        originalUnit: 'lakh',
        date: '2026-04-01',
        receiptId: receipt.id,
        approved: true,
        reviewStatus: 'verified',
      },
    ],
  };
}

describe('existing publication supports evidence-limited works', () => {
  it('allows a reviewed contract with missing payment and pending completion', () => {
    const work = workSchema.parse(contractOnly());
    expect(() => assertPublicationEvidence(work)).not.toThrow();
    expect(work.money.every((e) => e.measure !== 'payment')).toBe(true);
    expect(work.stages.find((s) => s.id === 'completion')?.state).toBe('pending');
  });

  it('allows an unlocated reviewed work but does not supply a map coordinate', () => {
    const work = contractOnly();
    work.location = null;
    work.locationPrecision = 'unknown';
    expect(() => assertPublicationEvidence(workSchema.parse(work))).not.toThrow();
    expect(work.location).toBeNull();
  });

  it('still rejects a precise map pin labelled only as district geography', () => {
    const work = contractOnly();
    work.locationPrecision = 'district';
    expect(() => workSchema.parse(work)).toThrow('precise map pin');
  });

  it('still rejects a found contract without explicit evidence review', () => {
    const work = contractOnly();
    work.stages[1].reviewStatus = 'pending';
    expect(() => assertPublicationEvidence(workSchema.parse(work))).toThrow(
      'verified evidence review',
    );
  });

  it('still requires explicit basis for a found completion claim', () => {
    const work = contractOnly();
    work.stages[3] = { ...work.stages[1], id: 'completion', label: 'Completion' };
    expect(() => assertPublicationEvidence(workSchema.parse(work))).toThrow(
      'reported or certificate',
    );
    work.stages[3].completionBasis = 'reported';
    expect(() => assertPublicationEvidence(workSchema.parse(work))).not.toThrow();
  });

  it('still rejects a payment copied from a contract without payment allocation evidence', () => {
    const work = contractOnly();
    work.stages[2] = { ...work.stages[1], id: 'payment', label: 'Payment' };
    work.money[0].measure = 'payment';
    expect(() => assertPublicationEvidence(workSchema.parse(work))).toThrow(
      'official project allocation',
    );
  });
});

function reviewContext(): PublicationReviewContext {
  const document = {
    documentHash: 'a'.repeat(64),
    url: 'https://example.invalid/contract.pdf',
    originalChecksumVerified: true,
    sourceApproved: true,
    reuseReviewed: true,
  };
  const association = {
    workId: 'synthetic-contract-work',
    officialProjectId: 'SYNTHETIC-1',
    documentHash: document.documentHash,
    url: document.url,
    locator: 'Synthetic test locator',
    basis: 'official_id' as const,
    reviewed: true,
  };
  return {
    documents: [document],
    approvedDistrictId: 'synthetic-area',
    identity: association,
    site: { ...association, coordinates: [80, 20] },
  };
}

describe('stricter private map-publication review aid', () => {
  it('can queue a documented contract-only project without inventing payment or completion', () => {
    const result = assessPublicationReviewReadiness(contractOnly(), reviewContext());
    expect(result.readyForOwnerDecision).toBe(true);
    expect(result.publicationApproved).toBe(false);
    expect(result.meaningfulReviewedStages).toEqual(['award']);
  });

  it('rejects an empty all-pending card even though the base schema allows that shape', () => {
    const work = contractOnly();
    work.money = [];
    work.stages = work.stages.map((s) => ({
      ...s,
      state: 'pending',
      reviewStatus: 'pending',
      receipts: [],
      amount: null,
    }));
    expect(workSchema.safeParse(work).success).toBe(true);
    expect(() => assertPublicationEvidence(work)).not.toThrow();
    expect(assessPublicationReviewReadiness(work, reviewContext()).readyForOwnerDecision).toBe(
      false,
    );
  });

  it('rejects a malformed candidate without receipts or required work fields', () => {
    expect(
      assessPublicationReviewReadiness({ id: 'candidate', location: [80, 20] }, reviewContext())
        .readyForOwnerDecision,
    ).toBe(false);
  });

  it('rejects a source coordinate whose project-site association is still unreviewed', () => {
    const context = reviewContext();
    context.site!.reviewed = false;
    expect(assessPublicationReviewReadiness(contractOnly(), context).readyForOwnerDecision).toBe(
      false,
    );
  });

  it('rejects unsupported inferred or nearby site coordinates', () => {
    const context = reviewContext();
    context.site!.coordinates = [80.001, 20];
    expect(assessPublicationReviewReadiness(contractOnly(), context).readyForOwnerDecision).toBe(
      false,
    );
    context.site!.coordinates = [80, 20];
    context.site!.basis = 'nearby_name' as never;
    expect(assessPublicationReviewReadiness(contractOnly(), context).readyForOwnerDecision).toBe(
      false,
    );
  });

  it('rejects a source with unresolved rights or a mismatched original', () => {
    const context = reviewContext();
    context.documents[0].reuseReviewed = false;
    expect(assessPublicationReviewReadiness(contractOnly(), context).readyForOwnerDecision).toBe(
      false,
    );
    context.documents[0].reuseReviewed = true;
    context.documents[0].documentHash = 'b'.repeat(64);
    expect(assessPublicationReviewReadiness(contractOnly(), context).readyForOwnerDecision).toBe(
      false,
    );
  });

  it('rejects a documentary association for a different project or district', () => {
    const context = reviewContext();
    context.identity!.officialProjectId = 'SYNTHETIC-2';
    context.approvedDistrictId = 'different-district';
    expect(assessPublicationReviewReadiness(contractOnly(), context).readyForOwnerDecision).toBe(
      false,
    );
  });

  it('keeps existing payment-specific checks in force', () => {
    const work = contractOnly();
    work.stages[2] = { ...work.stages[1], id: 'payment' };
    work.money[0].measure = 'payment';
    expect(assessPublicationReviewReadiness(work, reviewContext()).readyForOwnerDecision).toBe(
      false,
    );
  });
});
