import { describe, it, expect } from 'vitest';
import { locationReview } from '../src/lib/ppms-location-review';
import { safeBillBreakdown, type SafePaymentReview } from '../src/lib/panchayat-evidence';
const d = {
  projectCode: 'OD/1',
  projectConflict: false,
  project: { 'Project Code': 'OD/1', 'Project Name': 'Road', bankAccount: 'private' },
  bills: [{ 'Project Code': 'OD/1', 'Total Expenditure Amount': '12.30', bankAccount: 'private' }],
};
const l = {
  projectCode: 'OD/1',
  source: {
    url: 'https://ppms.odisha.gov.in/report/geo-tagging-status-detail/observed',
    sha256: 'hash',
  },
  geotags: [
    {
      stage: 'after',
      latitude: '20',
      longitude: '83',
      sourceDate: '01-01-2026',
      sourceStatus: 'Approved',
      bankAccount: 'private',
    },
  ],
};
describe('private project location review', () => {
  it('rejects mismatched project/bill/location identities', () => {
    expect(() => locationReview(d, { ...l, projectCode: 'OD/2' })).toThrow();
    expect(() => locationReview({ ...d, bills: [{ 'Project Code': 'OD/2' }] }, l)).toThrow();
    expect(() => locationReview({ ...d, projectConflict: true }, l)).toThrow();
  });
  it('excludes sensitive fields and preserves approval limits', () => {
    const r = locationReview(d, l);
    expect(JSON.stringify(r)).not.toContain('bankAccount');
    expect(r.bills[0].amount).toBe('12.30');
    expect(r.bills[0].paymentDate).toBeNull();
    expect(r.locations[0].verified).toBe(false);
    expect(r.approved).toBe(false);
    expect(r.settlementVerified).toBe(false);
  });
  it('attaches components only to the exact bill and excludes banking fields', () => {
    const raw = {
      projectCode: 'OD/1',
      billSerial: 'bill-1',
      reportAmount: '12.30',
      beneficiarySum: '12.30',
      matchesReportAmount: true,
      sourceUrl: 'https://ppms.odisha.gov.in/',
      interpretation: 'Source components; settlement unverified',
      records: [
        {
          serial: '1',
          sourceName: 'Agency',
          component: 'Royalty',
          amount: '12.30',
          sourcePaymentStatus: 'Success',
          bankAccount: 'private',
        },
      ],
    };
    const own = safeBillBreakdown(raw),
      other = { ...own, billSerial: 'bill-2' };
    const result = locationReview(
      { ...d, bills: [{ 'Project Code': 'OD/1', 'Bill Serial No': 'bill-1' }] },
      l,
      [],
      [own, other],
    );
    expect(result.billBreakdowns).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('bankAccount');
    expect(result.billBreakdowns[0].settlementVerified).toBe(false);
  });
  it('keeps recovered components separate from verified payments and missing original dates', () => {
    const document = {
      billSerial: 'bill-1',
      layoutClipped: true,
      cheque: { chequeDate: null },
    } as SafePaymentReview;
    const breakdown = safeBillBreakdown({
      projectCode: 'OD/1',
      billSerial: 'bill-1',
      reportAmount: '12.30',
      beneficiarySum: '12.30',
      matchesReportAmount: true,
      sourceUrl: 'official',
      interpretation: 'Source only',
      records: [],
    });
    const gaps = {
      projectCode: 'OD/1',
      specificGaps: ['Cheque date absent'],
      commonGaps: ['Settlement evidence pending'],
      bankAccount: 'private',
    };
    const result = locationReview(
      { ...d, bills: [{ 'Project Code': 'OD/1', 'Bill Serial No': 'bill-1', Status: 'Failed' }] },
      l,
      [document],
      [breakdown],
      gaps,
    );
    expect(result.coverage).toMatchObject({
      clippedDocumentsRecovered: 1,
      clippedDocumentsPending: 0,
      missingOriginalChequeDates: 1,
      failedBills: 1,
      verifiedSites: 0,
      verifiedSettlements: 0,
    });
    expect(result.missingEvidence).toEqual(['Cheque date absent', 'Settlement evidence pending']);
    expect(JSON.stringify(result)).not.toContain('bankAccount');
    const wrongBill = locationReview(
      { ...d, bills: [{ 'Project Code': 'OD/1', 'Bill Serial No': 'bill-1' }] },
      l,
      [document],
      [{ ...breakdown, billSerial: 'other' }],
      gaps,
    );
    expect(wrongBill.coverage.clippedDocumentsPending).toBe(1);
    expect(() => locationReview(d, l, [], [], { ...gaps, projectCode: 'OD/2' })).toThrow(
      'checklist identity',
    );
  });
});
