import { describe, it, expect } from 'vitest';
import { departmentExportReview } from '../src/lib/department-export-review';
const dates = () =>
  Object.fromEntries(
    [
      'initiation_date',
      'treasury_date',
      'cheque_date',
      'recipient_credit_return_date',
      'reporting_cutoff',
    ].map((k) => [k, { iso: null, sourceText: 'private raw text', bankAccount: 'private' }]),
  );
const row = (id = 1) => ({
  sourceIdentity: ['agency', String(id), ''],
  canonicalId: id.toString(16).padStart(64, '0'),
  importIds: ['one'],
  editionCount: 1,
  duplicateEditionsExcluded: 0,
  status: 'unreviewed',
  issues: [],
  billVoucherId: 'bill-1',
  amountsINR: { gross_amount: '100.00', deduction_amount: null, net_amount: null },
  sourceDates: dates(),
  sourceStatus: 'Treasury accepted',
  sourceFlowType: 'unclassified',
  allocations: [],
  allocationCoverage: {},
  approved: false,
  settlementVerified: false,
  publicationReady: false,
  bankAccount: 'private',
  sourcePayee: 'private label',
});
const catalogue = (rows: unknown[] = [row()]) => ({
  schemaVersion: 1,
  imports: 1,
  sourceRows: rows.length,
  uniquePayments: rows.length,
  conflictingPayments: 0,
  linkedUnreviewedPayments: 0,
  quarantinedImportRows: 0,
  approvedPayments: 0,
  records: rows,
  limitation: 'Private staging',
});
describe('department export owner projection', () => {
  it('keeps unreviewed source dates and amounts without private raw fields', () => {
    const result = departmentExportReview(catalogue());
    expect(JSON.stringify(result)).not.toContain('private');
    expect(result.records[0].amountsINR?.gross_amount).toBe('100.00');
    expect(result.records[0].sourceDates?.recipient_credit_return_date.iso).toBeNull();
    expect(result.approvedPayments).toBe(0);
  });
  it('rejects approvals and inconsistent coverage rather than downgrading them silently', () => {
    expect(() => departmentExportReview(catalogue([{ ...row(), approved: true }]))).toThrow();
    expect(() => departmentExportReview({ ...catalogue(), uniquePayments: 2 })).toThrow();
    expect(() => departmentExportReview({ ...catalogue(), linkedUnreviewedPayments: 1 })).toThrow();
    expect(() => departmentExportReview(catalogue([row(), row()]))).toThrow();
  });
  it('retains conflicts without choosing an amount', () => {
    const r = {
      ...row(),
      status: 'conflicting',
      issues: ['Conflicting payment editions'],
      amountsINR: null,
      sourceDates: null,
    };
    const result = departmentExportReview({ ...catalogue([r]), conflictingPayments: 1 });
    expect(result.records[0].amountsINR).toBeNull();
  });
  it('bounds pages and searches exact source/project identifiers', () => {
    const result = departmentExportReview(
      catalogue(Array.from({ length: 41 }, (_, i) => row(i + 1))),
      '',
      99,
    );
    expect(result.page).toBe(3);
    expect(result.records).toHaveLength(1);
    expect(departmentExportReview(catalogue(), 'unmatched').matchedPayments).toBe(0);
  });
  it('accepts partial gross/net coverage without summing the two bases', () => {
    const r = {
      ...row(),
      allocationCoverage: {
        gross: {
          allocatedAmountINR: '40.00',
          recordedAmountINR: '100.00',
          coversRecordedAmount: false,
        },
      },
    };
    const result = departmentExportReview(catalogue([r]));
    expect(result.records[0].allocationCoverage.net).toBeUndefined();
  });
});
