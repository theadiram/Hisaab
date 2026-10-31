import type { SourceReceipt, Work } from './model';

export const kebaliAssetId = '50aecc5a609e30111fdb:1298';
const notice =
  'Illustrative showcase: the archived asset name and coordinate are real source context. This improvement project, contractor, sanction, contract, bills, payments and completion are invented and are not government records.';
const sample = (id: string, title: string, text: string): SourceReceipt => ({
  id: 'kebali-demo-' + id,
  title: 'Illustrative ' + title,
  url: '',
  documentHash: '',
  locator: 'SHOWCASE ONLY · SAMPLE-' + id.toUpperCase(),
  retrievedAt: '2026-10-19',
  rawText: notice + '\n\n' + text,
  permission: 'Fictional local UI fixture; no government evidence or publication approval',
});
const sanction = sample(
  'sanction',
  'administrative sanction',
  'Sample sanction ₹32,00,000 dated 8 April 2026 for improvements to a paddy collection facility.',
);
const tender = sample(
  'contract',
  'tender award and contract',
  'Sample tender published 20 April 2026; sample award to Arun Mehra, Valley Civic Works (fictional), 18 May 2026. Contract ₹30,00,000.',
);
const rows = [
  {
    paymentId: 'SAMPLE-KEB-001',
    date: '2026-06-12',
    gross: '1000000.00',
    deductions: '50000.00',
    net: '950000.00',
  },
  {
    paymentId: 'SAMPLE-KEB-002',
    date: '2026-08-21',
    gross: '1100000.00',
    deductions: '55000.00',
    net: '1045000.00',
  },
  {
    paymentId: 'SAMPLE-KEB-003',
    date: '2026-10-05',
    gross: '900000.00',
    deductions: '45000.00',
    net: '855000.00',
  },
];
const advice = rows.map((r, i) =>
  sample(
    'payment-' + (i + 1),
    'payment advice ' + (i + 1),
    `Invented date ${r.date}. Gross INR ${r.gross}; deductions INR ${r.deductions}; net INR ${r.net}. Fictional recipient Arun Mehra. Reference ${r.paymentId}.`,
  ),
);
const completion = sample(
  'completion',
  'completion certificate',
  'Sample completion date 12 October 2026. Not an inspection or certificate for the actual archived facility.',
);

export const kebaliCardDemo: Work = {
  id: 'demo-kebali-paddy-card',
  assetId: kebaliAssetId,
  title: 'Paddy collection Centre Kebali',
  purpose: 'Buildings',
  state: 'Arunachal Pradesh',
  district: 'Kebali · source locality; fictional improvement project',
  areaId: 'demo-kebali-area',
  financialYear: '2026–27',
  officialIds: ['SAMPLE-KEB-SAN-2026-01', 'SAMPLE-KEB-TENDER-2026-02', 'SAMPLE-KEB-WO-2026-03'],
  location: [95.848635, 28.162476666667],
  locationPrecision: 'source_point',
  authority: 'Illustrative Agricultural Infrastructure Office (fictional)',
  authorityReceipt: sanction,
  demo: true,
  summary:
    notice +
    ' Sample scope: covered paddy collection shed, drying platform, drainage and weighing equipment. The archive does not establish that these works were commissioned here.',
  stages: [
    {
      id: 'sanction',
      label: 'Administrative sanction',
      state: 'found',
      date: '2026-04-08',
      amount: '3200000.00',
      description: 'Invented sanction ₹32 lakh.',
      receipts: [sanction],
    },
    {
      id: 'award',
      label: 'Contract awarded',
      state: 'found',
      date: '2026-05-18',
      amount: '3000000.00',
      description: 'Invented contract awarded to Valley Civic Works / Arun Mehra.',
      receipts: [tender],
    },
    {
      id: 'payment',
      label: 'Payments recorded',
      state: 'found',
      date: '2026-10-05',
      amount: '2850000.00',
      description:
        'Three invented net payments ₹28.50 lakh; gross ₹30 lakh less deductions ₹1.50 lakh.',
      receipts: advice,
    },
    {
      id: 'completion',
      label: 'Completion reported',
      state: 'found',
      date: '2026-10-12',
      amount: null,
      description: 'Invented showcase completion certificate. No real completion evidence.',
      completionBasis: 'certificate',
      receipts: [completion],
    },
  ],
  money: [
    {
      id: 'kebali-demo-sanction',
      measure: 'sanction',
      amount: '3200000.00',
      kind: 'transaction',
      canonicalId: 'kebali-demo-sanction',
      date: '2026-04-08',
      receiptId: sanction.id,
      approved: true,
    },
    {
      id: 'kebali-demo-contract',
      measure: 'contract',
      amount: '3000000.00',
      kind: 'transaction',
      canonicalId: 'kebali-demo-contract',
      date: '2026-05-18',
      receiptId: tender.id,
      approved: true,
    },
    ...rows.map((r, i) => ({
      id: 'kebali-demo-pay-' + i,
      measure: 'payment' as const,
      amount: r.net,
      kind: 'transaction' as const,
      canonicalId: 'kebali-demo-pay-' + i,
      date: r.date,
      receiptId: advice[i].id,
      approved: true,
      sourcePaymentId: r.paymentId,
      amountBasis: 'net' as const,
      flow: 'contractor_payment' as const,
      payee: 'Arun Mehra (fictional)',
    })),
  ],
  roles: [
    {
      id: 'kebali-demo-contractor',
      name: 'Arun Mehra',
      role: 'Fictional successful bidder and payment recipient',
      organisation: 'Valley Civic Works (fictional)',
      receipt: tender,
      photoUrl: '/images/demo/arun-mehra-portrait.png',
      photoSource: 'AI-generated fictional male portrait; not a real person or contractor',
    },
  ],
  demoProfile: {
    recipientAddress:
      'Unit 12, Example Trade Centre, Sample Market Road · fictional business address',
    recipientPhone: '+91 9XXXX XXXXX · sample, not dialable',
    recipientEmail: 'office@valleycivic.example.invalid',
    registration: 'SAMPLE-KEB-REG-026 · fictional, not valid',
    mappedLocality:
      'Paddy collection Centre Kebali · archived facility ID 1008397 · Arunachal Pradesh · 28.162477° N, 95.848635° E',
    mappedLocalitySource:
      'https://raw.githubusercontent.com/datameet/pmgsy-geosadak/ae9940c94ea61ebb1503952622b990aa1f0ec9d6/data/Facilities/ArunachalPradesh.zip',
    paymentBreakdown: rows,
    notice,
  },
  physicalVerification:
    'Illustrative completion only. The archived coordinate is not a verified building footprint; no real site inspection has been established',
};
