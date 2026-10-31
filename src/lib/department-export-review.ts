import { z } from 'zod';
const text = z.string().max(200),
  amount = z.string().regex(/^-?\d{1,24}\.\d{2}$/);
const count = z.number().int().nonnegative();
const date = z.object({
  iso: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});
const record = z.object({
  sourceIdentity: z.tuple([text, text, text]),
  canonicalId: z.string().regex(/^[a-f0-9]{64}$/),
  importIds: z.array(text),
  editionCount: count,
  duplicateEditionsExcluded: count,
  status: z.enum(['conflicting', 'unreviewed']),
  issues: z.array(text),
  billVoucherId: text.nullable(),
  amountsINR: z
    .object({
      gross_amount: amount.nullable(),
      deduction_amount: amount.nullable(),
      net_amount: amount.nullable(),
    })
    .nullable(),
  sourceDates: z
    .object({
      initiation_date: date,
      treasury_date: date,
      cheque_date: date,
      recipient_credit_return_date: date,
      reporting_cutoff: date,
    })
    .nullable(),
  sourceStatus: text.nullable(),
  sourceFlowType: text.nullable(),
  allocations: z.array(
    z.object({
      allocationId: z.string().regex(/^[a-f0-9]{64}$/),
      projectId: text,
      amountINR: amount,
      amountBasis: z.enum(['gross', 'net']),
      importIds: z.array(text),
    }),
  ),
  allocationCoverage: z.partialRecord(
    z.enum(['gross', 'net']),
    z.object({
      allocatedAmountINR: amount,
      recordedAmountINR: amount.nullable(),
      coversRecordedAmount: z.boolean(),
    }),
  ),
  approved: z.literal(false),
  settlementVerified: z.literal(false),
  publicationReady: z.literal(false),
});
const catalogue = z.object({
  schemaVersion: z.literal(1),
  imports: count,
  sourceRows: count,
  uniquePayments: count,
  conflictingPayments: count,
  linkedUnreviewedPayments: count,
  quarantinedImportRows: count,
  approvedPayments: z.literal(0),
  records: z.array(record),
  limitation: z.string().max(500),
});
export function departmentExportReview(input: unknown, query = '', page = 1) {
  const data = catalogue.parse(input);
  if (
    data.uniquePayments !== data.records.length ||
    new Set(data.records.map((r) => r.sourceIdentity.join('\u0000'))).size !==
      data.records.length ||
    data.conflictingPayments !== data.records.filter((r) => r.status === 'conflicting').length ||
    data.linkedUnreviewedPayments !==
      data.records.filter((r) => r.status === 'unreviewed' && r.allocations.length > 0).length
  )
    throw new Error('Export catalogue counts or identities inconsistent');
  const needle = query.trim().toLowerCase();
  const matches = data.records.filter((r) =>
    [...r.sourceIdentity, r.billVoucherId ?? '', ...r.allocations.map((a) => a.projectId)]
      .join(' ')
      .toLowerCase()
      .includes(needle),
  );
  const pages = Math.max(1, Math.ceil(matches.length / 20));
  const selectedPage = Math.min(Math.max(1, page), pages);
  return {
    ...data,
    records: matches.slice((selectedPage - 1) * 20, selectedPage * 20),
    matchedPayments: matches.length,
    page: selectedPage,
    pages,
  };
}
export type DepartmentExportReview = ReturnType<typeof departmentExportReview>;
