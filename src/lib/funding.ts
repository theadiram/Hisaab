import Decimal from 'decimal.js';
import { z } from 'zod';

export const fundingYears = Array.from({ length: 11 }, (_, i) => `${2026 - i}-${2027 - i}`);
export const fundingMeasures = ['allocated', 'released', 'reported_spent'] as const;
export const fundingPurposes = {
  infrastructure: 'Infrastructure',
  health: 'Health',
  education: 'Education',
  housing: 'Housing',
  agriculture: 'Agriculture',
  rural: 'Rural development',
  employment: 'Employment',
  social: 'Social development',
  energy: 'Energy',
  transport: 'Transport',
  environment: 'Environment',
  digital: 'Digital infrastructure',
  disaster_response: 'Disaster relief',
  disaster_mitigation: 'Disaster prevention',
  disaster_reconstruction: 'Disaster reconstruction',
  other: 'Other civil development',
};
// LGD state codes. Historical combined jurisdictions are retained separately in records.
export const fundingStates = [
  ['35', 'Andaman and Nicobar Islands'],
  ['28', 'Andhra Pradesh'],
  ['12', 'Arunachal Pradesh'],
  ['18', 'Assam'],
  ['10', 'Bihar'],
  ['4', 'Chandigarh'],
  ['22', 'Chhattisgarh'],
  ['38', 'Dadra and Nagar Haveli and Daman and Diu'],
  ['7', 'Delhi'],
  ['30', 'Goa'],
  ['24', 'Gujarat'],
  ['6', 'Haryana'],
  ['2', 'Himachal Pradesh'],
  ['1', 'Jammu and Kashmir'],
  ['20', 'Jharkhand'],
  ['29', 'Karnataka'],
  ['32', 'Kerala'],
  ['37', 'Ladakh'],
  ['31', 'Lakshadweep'],
  ['23', 'Madhya Pradesh'],
  ['27', 'Maharashtra'],
  ['14', 'Manipur'],
  ['17', 'Meghalaya'],
  ['15', 'Mizoram'],
  ['13', 'Nagaland'],
  ['21', 'Odisha'],
  ['34', 'Puducherry'],
  ['3', 'Punjab'],
  ['8', 'Rajasthan'],
  ['11', 'Sikkim'],
  ['33', 'Tamil Nadu'],
  ['36', 'Telangana'],
  ['16', 'Tripura'],
  ['9', 'Uttar Pradesh'],
  ['5', 'Uttarakhand'],
  ['19', 'West Bengal'],
].map(([code, name]) => ({ code, name }));
const money = z.string().regex(/^-?\d{1,18}\.\d{2}$/);
export const fundingRecordSchema = z
  .object({
    id: z.string().min(1).max(240),
    identity: z.string().min(1).max(240),
    edition: z.string().min(1).max(120),
    financialYear: z.enum(fundingYears as [string, ...string[]]),
    programmeId: z.string().min(1).max(200),
    programme: z.string().min(1).max(400),
    budgetHead: z.string().max(240),
    ministry: z.string().min(1).max(240),
    jurisdiction: z
      .string()
      .refine(
        (v) =>
          v === 'national' ||
          fundingStates.some((s) => s.code === v) ||
          /^historical:[a-z0-9_-]+$/.test(v),
      ),
    jurisdictionLabel: z.string().max(150),
    purpose: z.enum(
      Object.keys(fundingPurposes) as [
        keyof typeof fundingPurposes,
        ...(keyof typeof fundingPurposes)[],
      ],
    ),
    channel: z.enum([
      'central_sector',
      'centrally_sponsored',
      'development_grant',
      'capital_loan',
      'finance_commission',
      'disaster_grant',
      'other',
    ]),
    instrument: z.enum(['grant', 'loan', 'direct_expenditure', 'unresolved']),
    measure: z.enum(fundingMeasures),
    estimate: z.enum(['original', 'revised', 'not_applicable']),
    accountingBasis: z.enum([
      'union_budget',
      'union_release',
      'union_booked_expenditure',
      'recipient_utilisation',
    ]),
    share: z.enum(['union', 'combined', 'unresolved']),
    amountRupees: money.nullable(),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    cutoff: z.iso.date(),
    publicationDate: z.iso.date().nullable(),
    coverageKey: z.string().min(1).max(240),
    aggregation: z.enum(['leaf', 'context']),
    parentKey: z.string().max(240).nullable(),
    classification: z.enum(['included', 'excluded', 'mixed_unresolved', 'awaiting_review']),
    conflict: z.boolean(),
    source: z.object({
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      url: z.url().refine((v) => v.startsWith('https://')),
      locator: z.string().min(1).max(1200),
      retrievedAt: z.iso.datetime({ offset: true }),
      page: z.number().int().positive().nullable(),
    }),
    notes: z.string().max(3000),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (
      (r.measure === 'allocated' &&
        (r.estimate === 'not_applicable' || r.accountingBasis !== 'union_budget')) ||
      (r.measure === 'released' &&
        (r.estimate !== 'not_applicable' || r.accountingBasis !== 'union_release')) ||
      (r.measure === 'reported_spent' &&
        (r.estimate !== 'not_applicable' ||
          !['union_booked_expenditure', 'recipient_utilisation'].includes(r.accountingBasis)))
    )
      ctx.addIssue({ code: 'custom', message: 'Measure and accounting basis disagree' });
    if (r.periodStart > r.periodEnd || (r.measure !== 'allocated' && r.periodEnd > r.cutoff))
      ctx.addIssue({ code: 'custom', message: 'Invalid reporting period' });
  });
export type FundingRecord = z.infer<typeof fundingRecordSchema>;
export type FundingSelection = {
  year: string;
  measure: (typeof fundingMeasures)[number];
  purpose: string;
  basis: 'union' | 'recipient';
  estimate: 'original' | 'revised';
};
export function fundingSelection(params: URLSearchParams): FundingSelection {
  const allowed = ['year', 'measure', 'purpose', 'basis', 'estimate', 'offset', 'programme'];
  for (const key of params.keys())
    if (!allowed.includes(key) || params.getAll(key).length !== 1)
      throw new Error('Unknown or repeated funding filter');
  const year = params.get('year') ?? '2026-2027',
    measure = params.get('measure') ?? 'allocated',
    purpose = params.get('purpose') ?? 'all',
    basis = params.get('basis') ?? 'union',
    estimate = params.get('estimate') ?? 'original';
  if (
    !fundingYears.includes(year) ||
    !fundingMeasures.includes(measure as FundingSelection['measure']) ||
    (purpose !== 'all' && !(purpose in fundingPurposes)) ||
    !['union', 'recipient'].includes(basis) ||
    !['original', 'revised'].includes(estimate)
  )
    throw new Error('Invalid funding filter');
  if (basis === 'recipient' && measure !== 'reported_spent')
    throw new Error('Recipient utilisation is a reported-spent view');
  if (estimate === 'revised' && measure !== 'allocated')
    throw new Error('Estimates apply to allocation only');
  if (
    params.has('programme') &&
    (!params.get('programme') || params.get('programme')!.length > 200)
  )
    throw new Error('Invalid programme');
  if (params.has('offset') && !/^\d{1,6}$/.test(params.get('offset')!))
    throw new Error('Invalid page');
  return {
    year,
    measure: measure as FundingSelection['measure'],
    purpose,
    basis: basis as FundingSelection['basis'],
    estimate: estimate as FundingSelection['estimate'],
  };
}
export function normaliseFundingAmount(value: string, unit: 'rupee' | 'lakh' | 'crore') {
  const d = new Decimal(value).times(unit === 'crore' ? 10000000 : unit === 'lakh' ? 100000 : 1);
  if (!d.isFinite() || !d.eq(d.toDecimalPlaces(2)))
    throw new Error('Amount must be exact to paise');
  return d.toFixed(2);
}
// Published RPC records are already permission-reviewed. Still reject ambiguous accounting
// rather than silently using it in a headline. Equal or overlapping editions are not additive.
export function selectedFunding(records: FundingRecord[], s: FundingSelection) {
  const matching = records.filter(
    (r) =>
      r.financialYear === s.year &&
      r.measure === s.measure &&
      (s.purpose === 'all' || r.purpose === s.purpose) &&
      r.classification === 'included' &&
      r.share === 'union' &&
      !r.conflict &&
      r.aggregation === 'leaf' &&
      r.instrument !== 'unresolved' &&
      r.amountRupees !== null &&
      (s.measure !== 'allocated' || r.estimate === s.estimate) &&
      (s.basis === 'recipient'
        ? r.accountingBasis === 'recipient_utilisation'
        : r.accountingBasis !== 'recipient_utilisation'),
  );
  const groups = new Map<string, FundingRecord[]>();
  for (const r of matching) {
    const key = [r.coverageKey, r.jurisdiction, r.instrument, r.accountingBasis].join('|');
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const accepted: FundingRecord[] = [],
    conflicts: string[] = [];
  for (const [key, items] of groups) {
    const ids = new Set<string>();
    const unique = items.filter((r) => {
      if (ids.has(r.id)) return false;
      ids.add(r.id);
      return true;
    });
    // Multiple sources for one scope must have an explicit edition decision in publication.
    if (
      unique.some((a, i) =>
        unique.some(
          (b, j) => i < j && a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd,
        ),
      )
    ) {
      conflicts.push(key);
      continue;
    }
    accepted.push(...unique);
  }
  const parentKeys = new Set(accepted.map((r) => r.parentKey).filter(Boolean));
  return { records: accepted.filter((r) => !parentKeys.has(r.coverageKey)), conflicts };
}
export type FundingTotal = {
  amountRupees: string | null;
  records: number;
  coverage: 'partial' | 'unavailable';
  cutoff: string | null;
  grantsRupees: string | null;
  loansRupees: string | null;
  directRupees: string | null;
  missingAmounts: number;
};
export function fundingTotal(records: FundingRecord[]): FundingTotal {
  const sum = (rs: FundingRecord[]) =>
    rs.length ? rs.reduce((v, r) => v.plus(r.amountRupees!), new Decimal(0)).toFixed(2) : null;
  return {
    amountRupees: sum(records),
    records: records.length,
    coverage: records.length ? 'partial' : 'unavailable',
    cutoff: records.length ? records.map((r) => r.cutoff).sort()[0] : null,
    grantsRupees: sum(records.filter((r) => r.instrument === 'grant')),
    loansRupees: sum(records.filter((r) => r.instrument === 'loan')),
    directRupees: sum(records.filter((r) => r.instrument === 'direct_expenditure')),
    missingAmounts: 0,
  };
}
export function fundingOverview(records: FundingRecord[], selection: FundingSelection) {
  const chosen = selectedFunding(records, selection),
    rs = chosen.records;
  return {
    supportedYears: fundingYears,
    selection,
    scope: 'Union development funding',
    accountingNote:
      selection.measure === 'released'
        ? 'Union transfers to recipients; not proof of use or contractor payment.'
        : selection.basis === 'recipient'
          ? 'Recipient-reported utilisation; separate from Union booked expenditure.'
          : selection.measure === 'reported_spent'
            ? 'Union booked expenditure, including recorded transfers; not contractor payments.'
            : 'Budget estimates and documented Union allocations; not payments.',
    national: fundingTotal(rs),
    unassigned: fundingTotal(rs.filter((r) => r.jurisdiction === 'national')),
    historical: rs
      .filter((r) => r.jurisdiction.startsWith('historical:'))
      .map((r) => ({ name: r.jurisdictionLabel, ...fundingTotal([r]) })),
    states: fundingStates.map((st) => ({
      ...st,
      ...fundingTotal(rs.filter((r) => r.jurisdiction === st.code)),
    })),
    purposes: Object.entries(fundingPurposes).map(([id, name]) => ({
      id,
      name,
      ...fundingTotal(rs.filter((r) => r.purpose === id)),
    })),
    unassignedProgrammes: rs.filter((r) => r.jurisdiction === 'national'),
    historicalProgrammes: rs.filter((r) => r.jurisdiction.startsWith('historical:')),
    coverage: {
      complete: false,
      reviewedRecords: rs.length,
      statesWithRecords: new Set(
        rs
          .filter((r) => fundingStates.some((st) => st.code === r.jurisdiction))
          .map((r) => r.jurisdiction),
      ).size,
      statesExpected: 36,
      withheldConflictingScopes: chosen.conflicts.length,
      gaps: [
        'Programme inventory and development classification are still being reviewed.',
        'State allocations, releases and utilisation have different source coverage.',
        'A missing record is not zero funding.',
      ],
    },
  };
}
export type FundingOverview = ReturnType<typeof fundingOverview>;
