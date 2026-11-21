import { describe, expect, it } from 'vitest';
import { prepareHyderabadBudgetIntake } from '../src/lib/hyderabad-budget-intake';

const hash = 'dccc41cfedc0f973ef4ac1b6a58694d10313ee3edcab1cb117c7f4ea0cde104b';
const url =
  'https://www.telangana.gov.in/wp-content/uploads/2026/05/Municipal_Administration__Urban_Development_Department_1773982256_.pdf';

function fixture() {
  const source = {
    url,
    sha256: hash,
    retrievedAt: '2026-11-12T07:30:18.827666+00:00',
    locator: 'Original PDF page 13, synthetic fixture row',
  };
  const row = (index: number, loan: boolean) => ({
    id: `${hash}:synthetic:${index}`,
    stateCode: '36',
    financialYear: index % 3 === 2 ? '2026-2027' : '2025-2026',
    purposeLabel: loan ? 'Synthetic Hyderabad agency loan' : 'Synthetic HYDRAA context',
    measure: 'allocated',
    estimate: index % 3 === 1 ? 'revised' : 'original',
    unit: 'lakh',
    sourceAmount: '1,00.00',
    amountRupees: '10000000.00',
    aggregation: loan
      ? 'hyderabad_agency_budgeted_loan_subhead'
      : index < 3
        ? 'hyderabad_agency_establishment_total'
        : 'hyderabad_agency_scheme_total',
    ...(loan
      ? {
          accountingInstrument: 'state_budgeted_loan',
          sourceMajorHead: index < 15 ? '6215' : '6217',
          sourceSubheadCode: index < 9 ? '07' : index < 12 ? '08' : index < 15 ? '09' : '04',
        }
      : { sourceHeadCode: '2217' }),
    reviewStatus: 'awaiting_review',
    publicationApproved: false,
    source,
    notes: 'Synthetic budget estimate; not a release, expenditure or payment.',
  });
  return {
    candidates: {
      version: 'state-development-candidates/1',
      stateCode: '36',
      budgetCandidates: Array.from({ length: 18 }, (_, index) => row(index, index >= 6)),
    },
    checkpoint: {
      code: '36',
      documents: [
        {
          sourceId: 'telangana-maud-demand-17-2026',
          url,
          sha256: hash,
          retrievedAt: '2026-11-12T07:30:18.827666+00:00',
          contentType: 'application/pdf',
          permissionStatus: 'review_pending',
          publication: 'private_only',
          bytes: 9_234_344,
        },
      ],
    },
  };
}

describe('Hyderabad budget intake preparation', () => {
  it('produces only strict, private-review funding records', () => {
    const input = fixture();
    const batch = prepareHyderabadBudgetIntake(input.candidates, input.checkpoint);
    expect(batch.version).toBe('hisaab-intake/1');
    expect(batch.funding).toHaveLength(18);
    expect(batch.funding.filter((row) => row.instrument === 'loan')).toHaveLength(12);
    expect(batch.funding.every((row) => row.classification === 'awaiting_review')).toBe(true);
    expect(batch.funding.every((row) => row.accountingBasis === 'budget')).toBe(true);
    expect(batch.funding.every((row) => row.scope === 'received')).toBe(true);
    expect(batch.payments).toEqual([]);
  });

  it('rejects changed source identity and incomplete candidate sets', () => {
    const changed = fixture();
    changed.checkpoint.documents[0].sha256 = 'a'.repeat(64);
    expect(() => prepareHyderabadBudgetIntake(changed.candidates, changed.checkpoint)).toThrow();

    const incomplete = fixture();
    incomplete.candidates.budgetCandidates.pop();
    expect(() =>
      prepareHyderabadBudgetIntake(incomplete.candidates, incomplete.checkpoint),
    ).toThrow('Expected six HYDRAA context rows and twelve Hyderabad loan rows');

    const wrongAmount = fixture();
    wrongAmount.candidates.budgetCandidates[0].amountRupees = '999.00';
    expect(() =>
      prepareHyderabadBudgetIntake(wrongAmount.candidates, wrongAmount.checkpoint),
    ).toThrow('Hyderabad source retrieval identity or exact amount conversion changed');
  });
});
