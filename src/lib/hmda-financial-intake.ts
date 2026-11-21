import { z } from 'zod';
import { normaliseFundingAmount } from './funding';
import { validateIntake, type IntakePackage } from './intake-contract';

const editions = {
  'hmda-audited-financials-2025-26': {
    hash: 'bcded48b1acb30d2e22e61d4c5e68df9630ec430c594e653890e443795633545',
    url: 'https://www.hmda.gov.in/wp-content/uploads/2020/07/3.1_HMDA_Financials_2025-26.pdf',
    year: '2025-2026',
    name: 'HMDA audited financial statements for FY2025-26',
    family: 'local_authority_audited_financial_statements',
  },
  'hmda-q1-financials-2026-27': {
    hash: '24e672cb064a862032d5b6a5003af6abb1560ff38559863399f7e1226300915f',
    url: 'https://www.hmda.gov.in/wp-content/uploads/2020/07/1_HMDA_Q1_Unaudited-Financials_June-2026.pdf',
    year: '2026-2027',
    name: 'HMDA Q1 unaudited financial statements through June 2026',
    family: 'local_authority_interim_financial_statements',
  },
} as const;

type SourceId = keyof typeof editions;

const candidateSchema = z
  .object({
    id: z.string().min(1).max(240),
    stateCode: z.literal('36'),
    financialYear: z.enum(['2025-2026', '2026-2027']),
    purposeLabel: z.enum([
      'Capital Work in Progress additions',
      'Maintenance — Buildings',
      'Maintenance — Parks, Flyovers and Lakes',
      'Maintenance — Urban Blocks',
    ]),
    purposeCode: z.enum(['infrastructure', 'other']),
    measure: z.literal('reported_spent'),
    estimate: z.literal('not_applicable'),
    accountingBasis: z.literal('booked_expenditure'),
    unit: z.literal('lakh'),
    sourceActual: z.string().min(1).max(100),
    amountRupees: z.string().regex(/^\d{1,18}\.\d{2}$/),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    reportStatus: z.enum(['audited', 'unaudited_limited_review']),
    classification: z.enum(['capital_work_in_progress_additions', 'maintenance_expense']),
    reviewStatus: z.literal('awaiting_review'),
    publicationApproved: z.literal(false),
    source: z
      .object({
        url: z.url(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        retrievedAt: z.iso.datetime({ offset: true }),
        locator: z.string().min(1).max(1200),
      })
      .passthrough(),
    notes: z.string().min(1).max(3000),
  })
  .passthrough();

const candidatesSchema = z
  .object({
    version: z.literal('state-development-candidates/1'),
    stateCode: z.literal('36'),
    expenditureCandidates: z.array(candidateSchema),
  })
  .passthrough();

const documentSchema = z
  .object({
    sourceId: z.enum(Object.keys(editions) as [SourceId, ...SourceId[]]),
    url: z.url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
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
  .passthrough();

const checkpointSchema = z
  .object({
    code: z.literal('36'),
    documents: z.array(z.record(z.string(), z.unknown())),
  })
  .passthrough();

export function prepareHmdaFinancialIntake(
  candidatesInput: unknown,
  checkpointInput: unknown,
): IntakePackage {
  const candidates = candidatesSchema.parse(candidatesInput);
  const checkpoint = checkpointSchema.parse(checkpointInput);
  const documents = checkpoint.documents
    .filter((document) => typeof document.sourceId === 'string' && document.sourceId in editions)
    .map((document) => documentSchema.parse(document));
  if (documents.length !== 2 || new Set(documents.map((document) => document.sourceId)).size !== 2)
    throw new Error('Expected one audited and one interim HMDA financial document');

  const documentByHash = new Map(documents.map((document) => [document.sha256, document]));
  for (const document of documents) {
    const edition = editions[document.sourceId];
    if (document.sha256 !== edition.hash || document.url !== edition.url)
      throw new Error('HMDA source identity changed');
  }

  const rows = candidates.expenditureCandidates.filter((row) =>
    documentByHash.has(row.source.sha256),
  );
  const expectedRows = new Set(
    Object.values(editions).flatMap((edition) =>
      [
        'Capital Work in Progress additions',
        'Maintenance — Buildings',
        'Maintenance — Parks, Flyovers and Lakes',
        'Maintenance — Urban Blocks',
      ].map((label) => `${edition.hash}:${edition.year}:${label}`),
    ),
  );
  const actualRows = new Set(
    rows.map((row) => `${row.source.sha256}:${row.financialYear}:${row.purposeLabel}`),
  );
  if (
    rows.length !== 8 ||
    actualRows.size !== expectedRows.size ||
    [...actualRows].some((identity) => !expectedRows.has(identity))
  )
    throw new Error('Expected four bounded accounting lines from each HMDA statement');

  const funding = rows.map((row) => {
    const document = documentByHash.get(row.source.sha256)!;
    const edition = editions[document.sourceId];
    if (
      row.source.url !== document.url ||
      row.source.retrievedAt !== document.retrievedAt ||
      row.financialYear !== edition.year ||
      normaliseFundingAmount(row.sourceActual.replaceAll(',', ''), 'lakh') !== row.amountRupees
    )
      throw new Error('HMDA source retrieval identity or exact amount conversion changed');
    const pageMatch = /Original PDF page (\d+)/.exec(row.source.locator);
    if (!pageMatch) throw new Error(`Source page is absent from candidate ${row.id}`);
    const key = row.purposeLabel
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '');
    const programmeId = `hmda-${key}`;
    return {
      id: row.id,
      identity: `${programmeId}:${row.financialYear}:${row.periodEnd}`,
      edition: edition.name,
      financialYear: row.financialYear,
      programmeId,
      programme: row.purposeLabel,
      budgetHead:
        row.classification === 'capital_work_in_progress_additions'
          ? 'HMDA financial statements / Note 8 / Capital Work in Progress'
          : 'HMDA financial statements / Note 20 / Other Expenses / Maintenance',
      ministry: 'Hyderabad Metropolitan Development Authority',
      jurisdiction: '36',
      jurisdictionLabel: 'Telangana',
      purpose: row.purposeCode,
      channel: 'other' as const,
      instrument: 'direct_expenditure' as const,
      measure: 'reported_spent' as const,
      estimate: 'not_applicable' as const,
      amountRupees: row.amountRupees,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      cutoff: document.retrievedAt.slice(0, 10),
      publicationDate: null,
      coverageKey: `${programmeId}:${row.financialYear}:${row.periodEnd}`,
      aggregation: 'context' as const,
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
      notes: `Source amount ${row.sourceActual} ${row.unit}; ${row.reportStatus}. ${row.notes}`,
      origin: 'local' as const,
      scope: 'within_area' as const,
      accountingBasis: 'booked_expenditure' as const,
      reconciliationKey: programmeId,
      disjointEvidence: null,
      shares: [],
    };
  });

  const cutoff = documents
    .map((document) => document.retrievedAt.slice(0, 10))
    .sort()
    .at(-1)!;
  return validateIntake({
    version: 'hisaab-intake/1',
    batchId: `telangana-hmda-financials-${editions['hmda-q1-financials-2026-27'].hash.slice(0, 16)}`,
    jurisdiction: '36',
    cutoff,
    sources: documents.map((document) => {
      const edition = editions[document.sourceId];
      return {
        id: document.sourceId,
        name: edition.name,
        family: edition.family,
        hash: document.sha256,
        url: document.url,
        storagePath: `${document.sourceId}/${document.sha256}`,
        contentType: document.contentType,
        retrievedAt: document.retrievedAt,
        reuseBasis:
          'Official public HMDA financial statement; reuse rights remain pending owner review before publication.',
      };
    }),
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
        'Booked accounting expenditure does not establish cash payment, contractor settlement or completion.',
        'Capital-work additions may overlap income-statement expenses and must not be combined without review.',
        'Agency jurisdiction does not establish project location or complete Hyderabad coverage.',
      ],
      nextAction:
        'Review source rights, accounting overlap and HMDA geographic scope; obtain project, contract, bill and payment joins before publication.',
      checkpoint:
        'Two official PDF hashes, exact lakh conversions and eight source locators were validated locally; nothing was uploaded, staged, approved or published.',
    },
  }).package;
}
