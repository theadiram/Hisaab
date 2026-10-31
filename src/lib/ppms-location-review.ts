import type { SafePaymentReview, SafeBillBreakdown } from './panchayat-evidence';
type Dossier = {
  projectCode: string;
  projectConflict: boolean;
  project: Record<string, string> | null;
  bills: Record<string, string>[];
};
type Location = {
  projectCode: string;
  source: { url: string; sha256: string };
  geotags: {
    stage: string | null;
    latitude: string;
    longitude: string;
    sourceDate: string | null;
    sourceStatus: string | null;
  }[];
};
type ProjectGaps = { projectCode: string; specificGaps: string[]; commonGaps: string[] };
// Explicit projection keeps raw originals, banking fields and source personnel
// outside this response. Photo coordinates remain unverified source claims.
export function locationReview(
  d: Dossier,
  l: Location,
  payments: SafePaymentReview[] = [],
  breakdowns: SafeBillBreakdown[] = [],
  gaps: ProjectGaps | null = null,
) {
  if (
    d.projectConflict ||
    !d.project ||
    d.project['Project Code'] !== d.projectCode ||
    l.projectCode !== d.projectCode ||
    d.bills.some((b) => b['Project Code'] !== d.projectCode)
  )
    throw new Error('Conflicting project identity');
  if (gaps && gaps.projectCode !== d.projectCode)
    throw new Error('Conflicting gap checklist identity');
  const paymentDocuments = payments.filter((p) =>
    d.bills.some((b) => b['Bill Serial No'] === p.billSerial),
  );
  const billBreakdowns = breakdowns.filter((p) =>
    d.bills.some((b) => b['Bill Serial No'] === p.billSerial),
  );
  const clippedRecovered = paymentDocuments.filter(
    (p) => p.layoutClipped && billBreakdowns.some((b) => b.billSerial === p.billSerial),
  ).length;
  const coverage = {
    sourceLocations: l.geotags.length,
    billDocuments: paymentDocuments.length,
    visibleBillComponents: billBreakdowns.length,
    clippedDocumentsRecovered: clippedRecovered,
    clippedDocumentsPending:
      paymentDocuments.filter((p) => p.layoutClipped).length - clippedRecovered,
    missingOriginalChequeDates: paymentDocuments.filter((p) => !p.cheque?.chequeDate).length,
    failedBills: d.bills.filter((b) => b['Status'] === 'Failed').length,
    verifiedSites: 0,
    verifiedSettlements: 0,
  };
  return {
    projectCode: d.projectCode,
    title: d.project['Project Name'],
    district: d.project['District'],
    panchayat: d.project['Gram Panchayat / Ulb'],
    village: d.project['Village / Ward'],
    purpose: d.project['Scheme Component Name'],
    sourceCompletionDate: d.project['Physically Completed Date'],
    sourceWorkStatus: d.project['Work Status'],
    sourceUrl: l.source.url,
    sourceHash: l.source.sha256,
    bills: d.bills.map((b) => ({
      billSerial: b['Bill Serial No'],
      billNumber: b['Bill No'],
      financialYear: b['Financial Year'],
      amount: b['Total Expenditure Amount'],
      sourceStatus: b['Status'],
      amountBasis: 'Source expenditure field; units and gross/net definitions pending',
      paymentDate: null,
      recipient: null,
    })),
    locations: l.geotags.map((g) => ({
      stage: g.stage,
      latitude: g.latitude,
      longitude: g.longitude,
      sourceDate: g.sourceDate,
      sourceStatus: g.sourceStatus,
      verified: false,
    })),
    paymentDocuments,
    billBreakdowns,
    coverage,
    missingEvidence: gaps
      ? [...gaps.specificGaps, ...gaps.commonGaps]
      : ['Project-specific checklist not supplied; evidence review remains incomplete'],
    actualSiteVerified: false,
    settlementVerified: false,
    approved: false,
  };
}
export type LocationReview = ReturnType<typeof locationReview>;
