type Row = Record<string, unknown>;
const string = (value: unknown) => (typeof value === 'string' ? value : '');
const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter((v) => v && typeof v === 'object') : [];
export function pilotCards(input: unknown) {
  const cases = rows((input as { cases?: unknown })?.cases);
  return cases.map((c) => ({
    id: String(c.recommendationId),
    title: string(c.description).trim(),
    workIds: Array.isArray(c.paymentWorkIds)
      ? c.paymentWorkIds.filter((v) => typeof v === 'string')
      : [],
    approved: false,
    coordinates: null,
    bankSettlementVerified: false,
    sanctions: rows(c.sanctions).map((r) => ({
      amount: string(r.SANCTION_AMOUNT),
      date: string(r.SANCTION_DATE),
    })),
    payments: rows(c.sourceExpenditureRows).map((r) => ({
      amount: string(r.FUND_DISBURSED_AMT),
      date: string(r.EXPENDITURE_DATE),
      recipient: string(r.VENDOR_NAME),
      agency: string(r.IA_NAME),
      status: string(r.WORK_STATUS),
    })),
    portalCompletion: rows(c.portalCompletion).map((r) => string(r.ACTUAL_END_DATE)),
    facts: rows(c.documentFacts).map((r) => ({
      kind: string(r.kind),
      reference: string(r.documentCaseReference),
      gross: string(r.grossCappedRupees),
      deductions: string(r.deductionRupees),
      net: string(r.netPayableRupees),
      completionDate: string(r.certificateCompletionDate),
      notes: Array.isArray(r.notes) ? r.notes.filter((v) => typeof v === 'string') : [],
    })),
    documents: rows(c.documents).flatMap((r) => {
      const hash = string(r.binarySha256),
        file = string(r.binaryFile);
      const match = file.match(/^([a-f0-9]{64})\.(pdf|jpg)$/);
      return match && match[1] === hash
        ? [{ id: hash, extension: match[2], label: string(r.sourceFilename) }]
        : [];
    }),
  }));
}
export type PilotCard = ReturnType<typeof pilotCards>[number];
