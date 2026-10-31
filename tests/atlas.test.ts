import { describe, it, expect } from 'vitest';
import {
  developmentSchema,
  developmentOverview,
  developmentSelection,
  legacyDevelopment,
} from '../src/lib/development';
import { readExploration, explorationUrl } from '../src/lib/exploration';
import { validateIntake } from '../src/lib/intake-contract';
import { routeSchema } from '../src/lib/complaints';
const source = {
  hash: 'a'.repeat(64),
  url: 'https://example.invalid/official.pdf',
  locator: 'Table 1 row 3',
  retrievedAt: '2026-10-11T10:00:00Z',
  page: 1,
};
const funding = {
  id: 'fixture',
  identity: 'fixture-only',
  edition: 'test',
  financialYear: '2026-2027',
  programmeId: 'fixture',
  programme: 'Test-only school programme',
  budgetHead: 'example',
  ministry: 'Test authority',
  jurisdiction: '10',
  jurisdictionLabel: 'Bihar',
  purpose: 'education' as const,
  channel: 'centrally_sponsored' as const,
  instrument: 'grant' as const,
  measure: 'allocated' as const,
  estimate: 'original' as const,
  origin: 'union' as const,
  scope: 'within_area' as const,
  accountingBasis: 'budget' as const,
  reconciliationKey: 'fixture',
  disjointEvidence: null,
  shares: [],
  amountRupees: '100.10',
  periodStart: '2026-04-01',
  periodEnd: '2027-03-31',
  cutoff: '2026-10-11',
  publicationDate: '2026-02-01',
  coverageKey: 'fixture',
  aggregation: 'leaf' as const,
  parentKey: null,
  classification: 'included' as const,
  conflict: false,
  source,
  notes: 'Synthetic fixture; never publish',
};
const selection = developmentSelection(new URLSearchParams());
const batch = () => ({
  version: 'hisaab-intake/1',
  batchId: 'fixture-private-only',
  jurisdiction: '10',
  cutoff: '2026-10-11',
  sources: [
    {
      id: 'test-source',
      name: 'Test original',
      family: 'fixture',
      ...source,
      storagePath: 'test-source/' + source.hash,
      contentType: 'application/pdf',
      reuseBasis: 'Test fixture only',
    },
  ].map(({ page, locator, retrievedAt, ...s }) => ({ ...s, retrievedAt })),
  funding: [funding],
  coverage: {
    denominator: null,
    denominatorSource: null,
    years: ['2026-2027'],
    missing: ['No real evidence'],
    nextAction: 'Do not publish fixtures',
    checkpoint: 'test',
  },
});
describe('three-screen atlas accounting and intake', () => {
  it('constructs the runtime funding schema and keeps missing combined amounts unknown', () => {
    const r = developmentSchema.parse(funding),
      overview = developmentOverview([r], selection),
      b = overview.states.find((s) => s.code === '10')!;
    expect(b.development.origins[0].amountRupees).toBe('100.10');
    expect(b.development.combinedAmountRupees).toBeNull();
    expect(b.received.amountRupees).toBeNull();
    expect(overview.states).toHaveLength(36);
  });
  it('does not add transfers to development; reconciles exact joint shares', () => {
    const r = developmentSchema.parse({
      ...funding,
      origin: 'joint',
      shares: [
        { origin: 'union', amountRupees: '60.00', sourceLocator: 'Union share' },
        { origin: 'state', amountRupees: '40.10', sourceLocator: 'State share' },
      ],
      disjointEvidence: 'Official non-overlap allocation statement',
    });
    const transfer = developmentSchema.parse({ ...funding, id: 'transfer', scope: 'received' });
    const b = developmentOverview([r, transfer], selection).states.find((s) => s.code === '10')!;
    expect(b.development.combinedAmountRupees).toBe('100.10');
    expect(b.received.amountRupees).toBe('100.10');
    expect(() => developmentSchema.parse({ ...r, amountRupees: '100.11' })).toThrow();
  });
  it('withholds overlapping editions and excludes unresolved classifications', () => {
    const r = developmentSchema.parse(funding);
    expect(
      developmentOverview([r, { ...r, id: 'second' }], selection).coverage
        .withheldConflictingScopes,
    ).toBe(1);
    expect(
      developmentOverview([{ ...r, classification: 'mixed_unresolved' }], selection).coverage
        .reviewedRecords,
    ).toBe(0);
    expect(() => developmentSchema.parse({ ...funding, disjointEvidence: '' })).toThrow();
  });
  it('restores direct state/asset links and preserves unrelated URL parameters', () => {
    const state = readExploration(
      new URL('https://hisaab.test/state/10?year=2024-2025&measure=released&campaign=video'),
    );
    expect(state).toMatchObject({
      state: '10',
      screen: 'state',
      year: '2024-2025',
      measure: 'released',
      exploring: true,
    });
    const url = explorationUrl(
      { ...state, screen: 'asset', asset: 'abc:1', work: 'road' },
      new URL('https://hisaab.test/?campaign=video'),
    );
    expect(url).toContain('campaign=video');
    expect(readExploration(new URL(url, 'https://hisaab.test'))).toMatchObject({
      asset: 'abc:1',
      work: 'road',
      state: '10',
    });
    expect(readExploration(new URL('https://hisaab.test/?purpose=invalid')).purpose).toBe('all');
  });
  it('imports recommendations privately and rejects unidentified sources or unregistered jurisdictions', () => {
    expect(validateIntake(batch()).summary.publication).toBe('private_pending_review');
    expect(() => validateIntake({ ...batch(), jurisdiction: '99' })).toThrow();
    expect(() =>
      validateIntake({
        ...batch(),
        funding: [{ ...funding, source: { ...source, hash: 'b'.repeat(64) } }],
      }),
    ).toThrow('preserved');
  });
  it('rejects unsupported financial filters and email routing to CPGRAMS', () => {
    expect(() => developmentSelection(new URLSearchParams('origin=guess'))).toThrow();
    expect(() => developmentSelection(new URLSearchParams('basis=recipient'))).toThrow();
    expect(() =>
      routeSchema.parse({
        id: 'cpgrams',
        name: 'CPGRAMS',
        jurisdiction: 'national',
        authority: 'Public grievance authority',
        channel: 'email',
        destination: 'invalid@pgportal.gov.in',
        policyUrl: 'https://pgportal.gov.in/',
        policyNote: 'The official policy requires filing through the portal.',
        expiresAt: '2026-12-01',
      }),
    ).toThrow();
  });
});

describe('collector semantic safeguards', () => {
  it('requires preserved denominator evidence and checksum paths', () => {
    expect(() =>
      validateIntake({ ...batch(), coverage: { ...batch().coverage, denominator: 20 } }),
    ).toThrow('denominator');
    expect(() =>
      validateIntake({
        ...batch(),
        sources: batch().sources.map((s) => ({ ...s, storagePath: 'different/' + s.hash })),
      }),
    ).toThrow('path');
  });
  it('rejects silently moved state funding and fractional paise', () => {
    expect(() =>
      validateIntake({ ...batch(), funding: [{ ...funding, jurisdiction: '18' }] }),
    ).toThrow('jurisdiction');
    expect(() =>
      validateIntake({ ...batch(), funding: [{ ...funding, amountRupees: '100.101' }] }),
    ).toThrow();
  });
  it('keeps null transaction dates and documentary recipient/date roles private', () => {
    const payment = {
      id: 'payment',
      sourceRefs: [{ hash: source.hash, url: source.url, locator: source.locator }],
      sourcePaymentId: 'official:bill-1',
      billId: 'bill-1',
      recipientId: null,
      recipientRole: 'unknown',
      flow: 'unclassified',
      originalAmount: '1.001',
      originalUnit: 'lakh',
      amountRupees: '100100.00',
      amountBasis: 'unknown',
      grossRupees: null,
      deductionsRupees: null,
      netRupees: null,
      date: null,
      dateBasis: 'unknown',
      status: 'unknown',
      reversalOf: null,
      reissueOf: null,
    };
    const p = { ...batch(), payments: [payment] };
    expect(validateIntake(p).package.payments[0].date).toBeNull();
    expect(() =>
      validateIntake({ ...p, payments: [{ ...payment, dateBasis: 'recipient_credit' }] }),
    ).toThrow('missing date');
    expect(() =>
      validateIntake({ ...p, payments: [payment, { ...payment, id: 'mirror' }] }),
    ).toThrow('payment identity');
  });
  it('rejects cyclic histories and unreconciled deductions', () => {
    const payment = {
      id: 'payment',
      sourceRefs: [{ hash: source.hash, url: source.url, locator: source.locator }],
      sourcePaymentId: 'official:1',
      billId: 'bill-1',
      recipientId: null,
      recipientRole: 'unknown',
      flow: 'unclassified',
      originalAmount: '100',
      originalUnit: 'rupees',
      amountRupees: '100.00',
      amountBasis: 'gross',
      grossRupees: '100.00',
      deductionsRupees: '10.00',
      netRupees: '90.00',
      date: null,
      dateBasis: 'unknown',
      status: 'unknown',
      reversalOf: null,
      reissueOf: 'second',
    };
    expect(() =>
      validateIntake({
        ...batch(),
        payments: [
          payment,
          { ...payment, id: 'second', sourcePaymentId: 'official:2', reissueOf: 'payment' },
        ],
      }),
    ).toThrow('Cyclic');
    expect(() =>
      validateIntake({
        ...batch(),
        payments: [{ ...payment, reissueOf: null, netRupees: '90.01' }],
      }),
    ).toThrow('reconcile');
  });
});
