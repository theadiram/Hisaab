export type Measure = 'sanction' | 'contract' | 'payment';
export type EvidenceState =
  'found' | 'missing' | 'conflicting' | 'inaccessible' | 'not_applicable' | 'pending';
export type SourceReceipt = {
  id: string;
  title: string;
  url: string;
  documentHash: string;
  locator: string;
  retrievedAt: string;
  rawText: string;
  permission: string;
};
export type ReviewStatus = 'pending' | 'verified' | 'conflicting';
export type Stage = {
  id: string;
  label: string;
  state: EvidenceState;
  date: string | null;
  amount: string | null;
  description: string;
  reviewStatus?: ReviewStatus;
  completionBasis?: 'reported' | 'certificate';
  receipts: SourceReceipt[];
};
export type MoneyEvent = {
  id: string;
  measure: Measure;
  amount: string;
  kind: 'transaction' | 'cumulative' | 'reversal';
  canonicalId: string;
  date: string | null;
  receiptId: string;
  originalAmount?: string;
  originalUnit?: 'rupees' | 'lakh' | 'crore';
  approved: boolean;
  reviewStatus?: ReviewStatus;
  sourcePaymentId?: string;
  amountBasis?: 'gross' | 'net' | 'unknown';
  reportingCutoff?: string;
  flow?: 'contractor_payment' | 'government_transfer' | 'unclassified';
  payee?: string;
  allocation?: { projectId: string; amount: string; receiptId: string };
};
export type DemoProjectProfile = {
  recipientAddress: string;
  recipientPhone: string;
  recipientEmail: string;
  registration: string;
  mappedLocality?: string;
  mappedLocalitySource?: string;
  paymentBreakdown: {
    paymentId: string;
    date: string;
    gross: string;
    deductions: string;
    net: string;
  }[];
  notice: string;
};
export type Work = {
  id: string;
  title: string;
  purpose: string;
  state: string;
  district: string;
  areaId: string;
  financialYear: string;
  officialIds: string[];
  location: [number, number] | null;
  locationPrecision: 'source_point' | 'address' | 'district' | 'unknown';
  authority: string | null;
  authorityReceipt: SourceReceipt | null;
  stages: Stage[];
  money: MoneyEvent[];
  physicalVerification: string;
  summary: string;
  assetId?: string;
  roles?: PartyRole[];
  media?: ProjectMedia[];
  demo?: boolean;
  demoProfile?: DemoProjectProfile;
};
export type SourceRoute = {
  id: string;
  name: string;
  url: string;
  family: string;
  status: string;
  access: string;
  coverage: string;
  restriction: string;
  lastChecked: string | null;
};
export type Catalogue = {
  mode: 'empty' | 'local' | 'supabase';
  cutoff: string;
  works: Work[];
  totalWorks: number;
  sources: SourceRoute[];
  districtsExpected: number | null;
  districtsCovered: number;
  publishedAt: string | null;
};

export type PartyRole = {
  id: string;
  name: string;
  role: string;
  organisation: string | null;
  receipt: SourceReceipt;
  photoUrl: string | null;
  photoSource: string | null;
  identityBasis?: 'official_id' | 'documented_crosswalk';
};
export type ProjectMedia = {
  id: string;
  url: string;
  caption: string;
  date: string | null;
  receipt: SourceReceipt;
  kind: 'photo' | 'footprint';
};
