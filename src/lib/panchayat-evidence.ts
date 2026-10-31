export type SourceRecipient = {
  serial: string;
  sourceName: string;
  sourceRole: string;
  amount: string | null;
  roleVerified: boolean;
  component?: string;
  sourcePaymentStatus?: string;
  detailSourceUrl?: string;
};
export type PaymentReview = {
  projectCode: string;
  billSerial: string;
  reportAmount: string;
  cheque: {
    chequeDate: string | null;
    chequeNumber: string | null;
    chequeAmount: string;
    dateBasis: string;
    amountBasis: string;
  } | null;
  chequeMatchesReportAmount: boolean;
  beneficiarySum: string | null;
  beneficiariesMatchCheque: boolean;
  beneficiaryBreakdown: { layoutClipped: boolean; recipients: SourceRecipient[] };
  source: { url: string };
};
// Explicit projection excludes banking columns, extracted original text and any
// future sensitive fields from the owner card response as well as public data.
export function safePaymentReview(r: PaymentReview) {
  return {
    billSerial: r.billSerial,
    reportAmount: r.reportAmount,
    cheque: r.cheque
      ? {
          chequeDate: r.cheque.chequeDate,
          chequeNumber: r.cheque.chequeNumber,
          chequeAmount: r.cheque.chequeAmount,
          dateBasis: r.cheque.dateBasis,
          amountBasis: r.cheque.amountBasis,
        }
      : null,
    chequeMatchesReportAmount: r.chequeMatchesReportAmount,
    beneficiarySum: r.beneficiarySum,
    beneficiariesMatchCheque: r.beneficiariesMatchCheque,
    layoutClipped: r.beneficiaryBreakdown.layoutClipped,
    recipients: r.beneficiaryBreakdown.recipients.map((b) => ({
      serial: b.serial,
      sourceName: b.sourceName,
      sourceRole: b.sourceRole,
      amount: b.amount,
      roleVerified: false,
      component: b.component ?? null,
      sourcePaymentStatus: b.sourcePaymentStatus ?? null,
      detailSourceUrl: b.detailSourceUrl ?? null,
    })),
    sourceUrl: r.source.url,
    settlementVerified: false,
    approved: false,
  };
}
export type SafePaymentReview = ReturnType<typeof safePaymentReview>;
export type VisibleBillBreakdown = {
  projectCode: string;
  billSerial: string;
  reportAmount: string;
  beneficiarySum: string;
  matchesReportAmount: boolean;
  sourceUrl: string;
  interpretation: string;
  records: {
    serial: string;
    sourceName: string;
    component: string;
    amount: string;
    sourcePaymentStatus: string;
  }[];
};
export function safeBillBreakdown(r: VisibleBillBreakdown) {
  return {
    billSerial: r.billSerial,
    reportAmount: r.reportAmount,
    beneficiarySum: r.beneficiarySum,
    matchesReportAmount: r.matchesReportAmount,
    sourceUrl: r.sourceUrl,
    interpretation: r.interpretation,
    recipients: r.records.map((b) => ({
      serial: b.serial,
      sourceName: b.sourceName,
      component: b.component,
      amount: b.amount,
      sourcePaymentStatus: b.sourcePaymentStatus,
    })),
    approved: false,
    settlementVerified: false,
  };
}
export type SafeBillBreakdown = ReturnType<typeof safeBillBreakdown>;
export type TreasuryFlow = {
  projectCode: string;
  billSerial: string;
  sourceUrl: string;
  columnWarning: string;
  records: { serial: string; sourceDate: string; event: string; sourceText: string }[];
};
export function safeTreasuryFlow(r: TreasuryFlow) {
  return {
    billSerial: r.billSerial,
    sourceUrl: r.sourceUrl,
    columnWarning: r.columnWarning,
    events: r.records.map((e) => ({
      serial: e.serial,
      sourceDate: e.sourceDate,
      event: e.event,
      sourceText: e.sourceText,
    })),
    dateBasis:
      'Source bill/treasury workflow dates, not independently verified recipient settlement',
    approved: false,
    settlementVerified: false,
  };
}
export type SafeTreasuryFlow = ReturnType<typeof safeTreasuryFlow>;
