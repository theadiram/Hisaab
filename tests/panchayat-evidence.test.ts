import { describe, it, expect } from 'vitest';
import {
  safeTreasuryFlow,
  type TreasuryFlow,
  safePaymentReview,
  safeBillBreakdown,
  type VisibleBillBreakdown,
  type PaymentReview,
} from '../src/lib/panchayat-evidence';
describe('Private payment card projection', () => {
  it('does not turn treasury processing dates into verified recipient settlement', () => {
    const source = {
      projectCode: 'project',
      billSerial: 'bill',
      sourceUrl: 'official',
      columnWarning: 'four cells under five headers',
      records: [
        {
          serial: '4',
          sourceDate: '26-02-2026',
          event: 'Treasury processed payment',
          sourceText: 'Success',
          bankAccount: 'SECRET',
        },
      ],
      settlementVerified: true,
      approved: true,
    } as unknown as TreasuryFlow;
    const r = safeTreasuryFlow(source);
    expect(r.events[0].sourceDate).toBe('26-02-2026');
    expect(r.dateBasis).toContain('not independently verified');
    expect(r.settlementVerified).toBe(false);
    expect(r.approved).toBe(false);
    expect(JSON.stringify(r)).not.toContain('SECRET');
  });
  it('keeps visible bill breakdown separate and excludes banking and snapshot internals', () => {
    const r = {
      projectCode: 'project',
      billSerial: 'bill',
      reportAmount: '399000.00',
      beneficiarySum: '399000.00',
      matchesReportAmount: true,
      sourceUrl: 'https://ppms.odisha.gov.in/report/ifms-transaction',
      interpretation: 'Cheque scope unconfirmed',
      records: [
        {
          serial: '1',
          sourceName: 'Royalty On Sand',
          component: 'Royalty Sand',
          amount: '738.00',
          sourcePaymentStatus: 'Success',
          account: 'SECRET',
        },
      ],
      sourceSnapshot: { file: 'SECRET' },
      approved: true,
      settlementVerified: true,
    } as unknown as VisibleBillBreakdown;
    const result = safeBillBreakdown(r);
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(result.approved).toBe(false);
    expect(result.settlementVerified).toBe(false);
    expect(result.reportAmount).toBe('399000.00');
    expect(result.recipients[0].amount).toBe('738.00');
  });
  it('excludes original banking data and cannot promote a cheque or recipient to verification', () => {
    const record = {
      projectCode: 'official-id',
      billSerial: 'bill',
      reportAmount: '100.00',
      cheque: {
        chequeDate: '01-02-2026',
        chequeNumber: '1',
        chequeAmount: '100.00',
        dateBasis: 'cheque',
        amountBasis: 'unknown',
        bankAccount: 'SECRET',
      },
      chequeMatchesReportAmount: true,
      beneficiarySum: '100.00',
      beneficiariesMatchCheque: true,
      beneficiaryBreakdown: {
        layoutClipped: false,
        recipients: [
          {
            serial: '1',
            sourceName: 'Source executant (AE / JE)',
            sourceRole: 'AE / JE',
            amount: '100.00',
            roleVerified: true,
            bankAccount: 'SECRET',
            mobile: 'SECRET',
          },
        ],
      },
      source: { url: 'https://ppms.odisha.gov.in/report/example', originalText: 'SECRET' },
      approved: true,
      settlementVerified: true,
    } as unknown as PaymentReview;
    const result = safePaymentReview(record);
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(result.approved).toBe(false);
    expect(result.settlementVerified).toBe(false);
    expect(result.recipients[0].roleVerified).toBe(false);
  });
});
