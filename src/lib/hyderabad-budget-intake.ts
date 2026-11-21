import { z } from 'zod';
import { validateIntake, type IntakePackage } from './intake-contract';
import { normaliseFundingAmount } from './funding';

const sourceHash = 'dccc41cfedc0f973ef4ac1b6a58694d10313ee3edcab1cb117c7f4ea0cde104b';
const sourceUrl =
  'https://www.telangana.gov.in/wp-content/uploads/2026/05/Municipal_Administration__Urban_Development_Department_1773982256_.pdf';

const sourceSchema = z
  .object({
    url: z.literal(sourceUrl),
    sha256: z.literal(sourceHash),
    retrievedAt: z.iso.datetime({ offset: true }),
    locator: z.string().min(1).max(1200),
  })
  .passthrough();

const candidateSchema = z
  .object({
    id: z.string().min(1).max(240),
    stateCode: z.literal('36'),
    financialYear: z.enum(['2025-2026', '2026-2027']),
    purposeLabel: z.string().min(1).max(400),
    measure: z.literal('allocated'),
    estimate: z.enum(['original', 'revised']),
    unit: z.literal('lakh'),
    sourceAmount: z.string().min(1).max(100),
    amountRupees: z.string().regex(/^\d{1,18}\.\d{2}$/),
    aggregation: z.enum([
      'hyderabad_agency_establishment_total',
      'hyderabad_agency_scheme_total',
      'hyderabad_agency_budgeted_loan_subhead',
    ]),
    accountingInstrument: z.literal('state_budgeted_loan').optional(),
    sourceHeadCode: z.literal('2217').optional(),
    sourceMajorHead: z.enum(['6215', '6217']).optional(),
    sourceSubheadCode: z.enum(['04', '07', '08', '09']).optional(),
    reviewStatus: z.literal('awaiting_review'),
    publicationApproved: z.literal(false),
    source: sourceSchema,
    notes: z.string().min(1).max(3000),
  })
  .passthrough();

const candidatesSchema = z
  .object({
    version: z.literal('state-development-candidates/1'),
    stateCode: z.literal('36'),
    budgetCandidates: z.array(candidateSchema),
  })
  .passthrough();

const checkpointSchema = z
  .object({
    code: z.literal('36'),
    documents: z
      .array(
        z
          .object({
            sourceId: z.literal('telangana-maud-demand-17-2026'),
            url: z.literal(sourceUrl),
            sha256: z.literal(sourceHash),
            retrievedAt: z.iso.datetime({ offset: true }),
            contentType: z.literal('application/pdf'),
            permissionStatus: z.literal('review_pending'),
            publication: z.literal('private_only'),
            bytes: z
              .number()
              .int()
              .positive()
              .max(10 * 1024 * 1024),
          })
          .passthrough(),
      )
      .length(1),
  })
  .passthrough();

function fiscalDates(financialYear: '2025-2026' | '2026-2027') {
  const start = financialYear.slice(0, 4);
  const end = financialYear.slice(5);
  return { periodStart: `${start}-04-01`, periodEnd: `${end}-03-31` };
}

export function prepareHyderabadBudgetIntake(
  candidatesInput: unknown,
  checkpointInput: unknown,
): IntakePackage {
  const candidates = candidatesSchema.parse(candidatesInput);
  const checkpoint = checkpointSchema.parse(checkpointInput);
  const rows = candidates.budgetCandidates.filter((row) => row.source.sha256 === sourceHash);
  const loanRows = rows.filter(
    (row) => row.aggregation === 'hyderabad_agency_budgeted_loan_subhead',
  );
  if (rows.length !== 18 || loanRows.length !== 12)
    throw new Error('Expected six HYDRAA context rows and twelve Hyderabad loan rows');
  if (
    loanRows.some(
      (row) =>
        row.accountingInstrument !== 'state_budgeted_loan' ||
        !row.sourceMajorHead ||
        !row.sourceSubheadCode,
    )
  )
    throw new Error('Hyderabad loan accounting identity is incomplete');

  const document = checkpoint.documents[0];
  const editions = ['2025-2026:original', '2025-2026:revised', '2026-2027:original'];
  const expectedRows = new Set([
    ...['hyderabad_agency_establishment_total', 'hyderabad_agency_scheme_total'].flatMap(
      (aggregation) => editions.map((edition) => `context:${aggregation}:${edition}`),
    ),
    ...['6215:07', '6215:08', '6215:09', '6217:04'].flatMap((head) =>
      editions.map((edition) => `loan:${head}:${edition}`),
    ),
  ]);
  const actualRows = new Set(
    rows.map((row) =>
      row.aggregation === 'hyderabad_agency_budgeted_loan_subhead'
        ? `loan:${row.sourceMajorHead}:${row.sourceSubheadCode}:${row.financialYear}:${row.estimate}`
        : `context:${row.aggregation}:${row.financialYear}:${row.estimate}`,
    ),
  );
  if (
    actualRows.size !== expectedRows.size ||
    [...actualRows].some((identity) => !expectedRows.has(identity))
  )
    throw new Error('Hyderabad budget head, year or estimate coverage changed');
  if (
    rows.some(
      (row) =>
        row.source.retrievedAt !== document.retrievedAt ||
        normaliseFundingAmount(row.sourceAmount.replaceAll(',', ''), 'lakh') !== row.amountRupees,
    )
  )
    throw new Error('Hyderabad source retrieval identity or exact amount conversion changed');

  const funding = rows.map((row) => {
    const loan = row.aggregation === 'hyderabad_agency_budgeted_loan_subhead';
    const head = loan ? row.sourceMajorHead! : row.sourceHeadCode!;
    const programmeId = loan
      ? `telangana-maud-${head}-sh${row.sourceSubheadCode}`
      : `telangana-maud-hydraa-${row.aggregation.replace('hyderabad_agency_', '')}`;
    const pageMatch = /Original PDF page(?:s)? (\d+)/.exec(row.source.locator);
    if (!pageMatch) throw new Error(`Source page is absent from candidate ${row.id}`);
    const dates = fiscalDates(row.financialYear);
    return {
      id: row.id,
      identity: `${programmeId}:${row.financialYear}:${row.estimate}`,
      edition: 'Telangana Budget 2026-27 Demand XVII',
      financialYear: row.financialYear,
      programmeId,
      programme: row.purposeLabel,
      budgetHead: loan
        ? `Demand XVII / Major Head ${head} / S.H.(${row.sourceSubheadCode})`
        : `Demand XVII / Head ${head} / ${row.aggregation}`,
      ministry: 'Municipal Administration and Urban Development Department, Telangana',
      jurisdiction: '36',
      jurisdictionLabel: 'Telangana',
      purpose: loan
        ? head === '6217'
          ? ('transport' as const)
          : ('infrastructure' as const)
        : ('other' as const),
      channel: loan ? ('capital_loan' as const) : ('other' as const),
      instrument: loan ? ('loan' as const) : ('unresolved' as const),
      measure: 'allocated' as const,
      estimate: row.estimate,
      amountRupees: row.amountRupees,
      ...dates,
      cutoff: document.retrievedAt.slice(0, 10),
      publicationDate: null,
      coverageKey: `${programmeId}:${row.financialYear}`,
      aggregation: loan ? ('leaf' as const) : ('context' as const),
      parentKey: null,
      classification: 'awaiting_review' as const,
      conflict: false,
      source: {
        hash: row.source.sha256,
        url: row.source.url,
        locator: row.source.locator,
        retrievedAt: row.source.retrievedAt,
        page: Number(pageMatch[1]),
      },
      notes: `Source amount ${row.sourceAmount} ${row.unit}. ${row.notes}`,
      origin: 'state' as const,
      scope: 'received' as const,
      accountingBasis: 'budget' as const,
      reconciliationKey: `${programmeId}:${row.financialYear}`,
      disjointEvidence: null,
      shares: [],
    };
  });

  return validateIntake({
    version: 'hisaab-intake/1',
    batchId: `telangana-hyderabad-budget-${sourceHash.slice(0, 16)}`,
    jurisdiction: '36',
    cutoff: document.retrievedAt.slice(0, 10),
    sources: [
      {
        id: 'telangana-maud-demand-17-2026',
        name: 'Telangana FY2026-27 Demand XVII: Municipal Administration and Urban Development',
        family: 'state_budget',
        hash: document.sha256,
        url: document.url,
        storagePath: `telangana-maud-demand-17-2026/${document.sha256}`,
        contentType: document.contentType,
        retrievedAt: document.retrievedAt,
        reuseBasis:
          'Official public government budget PDF; reuse rights remain pending owner review before publication.',
      },
    ],
    projects: [],
    funding,
    assets: [],
    contracts: [],
    payments: [],
    allocations: [],
    parties: [],
    completion: [],
    coverage: {
      denominator: null,
      denominatorSource: null,
      years: ['2025-2026', '2026-2027'],
      missing: [
        'Source reuse rights and accounting interpretation remain pending owner review.',
        'Budget estimates do not establish release, receipt, expenditure, contractor payment or completion.',
        'Agency and programme names do not establish a project location or complete Hyderabad coverage.',
        'Original and revised estimates are alternative editions and must not be added together.',
      ],
      nextAction:
        'Review source rights, loan direction, geographic scope and original-versus-revised edition before any publication decision.',
      checkpoint:
        'Official PDF hash, exact amount units and locators were validated locally; nothing was uploaded, staged, approved or published.',
    },
  }).package;
}
