import { describe, expect, it } from 'vitest';
import { prepareHmdaFinancialIntake } from '../src/lib/hmda-financial-intake';

const sources = [
  {
    sourceId: 'hmda-audited-financials-2025-26',
    url: 'https://www.hmda.gov.in/wp-content/uploads/2020/07/3.1_HMDA_Financials_2025-26.pdf',
    sha256: 'bcded48b1acb30d2e22e61d4c5e68df9630ec430c594e653890e443795633545',
    year: '2025-2026',
    periodStart: '2025-04-01',
    periodEnd: '2026-03-31',
    status: 'audited',
  },
  {
    sourceId: 'hmda-q1-financials-2026-27',
    url: 'https://www.hmda.gov.in/wp-content/uploads/2020/07/1_HMDA_Q1_Unaudited-Financials_June-2026.pdf',
    sha256: '24e672cb064a862032d5b6a5003af6abb1560ff38559863399f7e1226300915f',
    year: '2026-2027',
    periodStart: '2026-04-01',
    periodEnd: '2026-06-30',
    status: 'unaudited_limited_review',
  },
];

const labels = [
  'Capital Work in Progress additions',
  'Maintenance — Buildings',
  'Maintenance — Parks, Flyovers and Lakes',
  'Maintenance — Urban Blocks',
] as const;

function fixture() {
  const retrievedAt = '2026-11-12T07:30:18.827666+00:00';
  return {
    candidates: {
      version: 'state-development-candidates/1',
      stateCode: '36',
      expenditureCandidates: sources.flatMap((source) =>
        labels.map((purposeLabel, index) => ({
          id: `${source.sha256}:synthetic:${index}`,
          stateCode: '36',
          financialYear: source.year,
          purposeLabel,
          purposeCode: index === 3 ? 'other' : 'infrastructure',
          measure: 'reported_spent',
          estimate: 'not_applicable',
          accountingBasis: 'booked_expenditure',
          unit: 'lakh',
          sourceActual: '100.00',
          amountRupees: '10000000.00',
          periodStart: source.periodStart,
          periodEnd: source.periodEnd,
          reportStatus: source.status,
          classification:
            index === 0 ? 'capital_work_in_progress_additions' : 'maintenance_expense',
          reviewStatus: 'awaiting_review',
          publicationApproved: false,
          source: {
            url: source.url,
            sha256: source.sha256,
            retrievedAt,
            locator: `Original PDF page ${index === 0 ? 10 : 11}, synthetic fixture row`,
          },
          notes: 'Synthetic booked accounting line; not a cash payment or project allocation.',
        })),
      ),
    },
    checkpoint: {
      code: '36',
      documents: sources.map((source) => ({
        sourceId: source.sourceId,
        url: source.url,
        sha256: source.sha256,
        retrievedAt,
        contentType: 'application/pdf',
        permissionStatus: 'review_pending',
        publication: 'private_only',
        bytes: 1_500_000,
      })),
    },
  };
}

describe('HMDA financial intake preparation', () => {
  it('produces eight strict, review-pending accounting records and no payments', () => {
    const input = fixture();
    const batch = prepareHmdaFinancialIntake(input.candidates, input.checkpoint);
    expect(batch.version).toBe('hisaab-intake/1');
    expect(batch.sources).toHaveLength(2);
    expect(batch.funding).toHaveLength(8);
    expect(batch.funding.every((row) => row.measure === 'reported_spent')).toBe(true);
    expect(batch.funding.every((row) => row.accountingBasis === 'booked_expenditure')).toBe(true);
    expect(batch.funding.every((row) => row.classification === 'awaiting_review')).toBe(true);
    expect(batch.funding.every((row) => row.origin === 'local')).toBe(true);
    expect(batch.payments).toEqual([]);
  });

  it('rejects changed source identity, incomplete rows and amount drift', () => {
    const changed = fixture();
    changed.checkpoint.documents[0].sha256 = 'a'.repeat(64);
    expect(() => prepareHmdaFinancialIntake(changed.candidates, changed.checkpoint)).toThrow();

    const incomplete = fixture();
    incomplete.candidates.expenditureCandidates.pop();
    expect(() => prepareHmdaFinancialIntake(incomplete.candidates, incomplete.checkpoint)).toThrow(
      'Expected four bounded accounting lines from each HMDA statement',
    );

    const wrongAmount = fixture();
    wrongAmount.candidates.expenditureCandidates[0].amountRupees = '999.00';
    expect(() =>
      prepareHmdaFinancialIntake(wrongAmount.candidates, wrongAmount.checkpoint),
    ).toThrow('HMDA source retrieval identity or exact amount conversion changed');
  });
});
