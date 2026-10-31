import type { SourceReceipt, Work } from './model';

const notice =
  'Illustrative showcase only. People, payments and project records are fictional. The mapped locality is real map context, not a verified project site or recipient address.';
const receipt = (id: string, title: string, locator: string, rawText: string): SourceReceipt => ({
  id,
  title,
  url: '',
  documentHash: '',
  locator: `DEMO ONLY · ${locator}`,
  retrievedAt: '2026-10-18',
  rawText: `${notice}\n\n${rawText}`,
  permission: 'Fictional local design fixture; not a government source',
});
const sanction = receipt(
  'demo-school-sanction',
  'Illustrative administrative sanction',
  'Sample file DEMO-SAN-2025-041',
  'Approval shown solely to demonstrate the card. Fictional amount: ₹50,00,000, dated 12 April 2025.',
);
const contract = receipt(
  'demo-school-contract',
  'Illustrative contract and work order',
  'Sample file DEMO-WO-2025-017',
  'Fictional award to Neela Rao / Sampurna Civic Works (fictional). Fictional contract amount: ₹46,00,000, dated 28 May 2025.',
);
const payments = [
  {
    id: 'demo-school-payment-1',
    date: '2025-07-16',
    gross: '1550000.00',
    deductions: '50000.00',
    net: '1500000.00',
    ref: 'Example payment 01',
  },
  {
    id: 'demo-school-payment-2',
    date: '2025-09-18',
    gross: '1300000.00',
    deductions: '50000.00',
    net: '1250000.00',
    ref: 'Example payment 02',
  },
  {
    id: 'demo-school-payment-3',
    date: '2025-12-12',
    gross: '1750000.00',
    deductions: '50000.00',
    net: '1700000.00',
    ref: 'Example payment 03',
  },
];
const paymentReceipts = payments.map((p, i) =>
  receipt(
    `demo-school-receipt-${i + 1}`,
    `Illustrative payment advice ${i + 1}`,
    `Sample voucher ${p.ref}`,
    `Fictional gross bill ₹${Number(p.gross).toLocaleString('en-IN')}; fictional deductions ₹${Number(p.deductions).toLocaleString('en-IN')}; fictional net transfer ₹${Number(p.net).toLocaleString('en-IN')} to the fictional contractor on ${p.date}.`,
  ),
);
const completion = receipt(
  'demo-school-completion',
  'Illustrative completion certificate',
  'Sample file DEMO-COMP-2026-006',
  'Fictional completion reported 31 January 2026. This sample is not evidence of a real asset or a real inspection.',
);
const receipts = [sanction, contract, ...paymentReceipts, completion];

export const completeCardDemo: Work = {
  id: 'demo-complete-school-card',
  title: 'Garden pathways and visitor facilities',
  purpose: 'Buildings',
  state: 'Karnataka',
  district: 'Bengaluru Urban · illustrative project',
  areaId: 'demo-area-complete',
  financialYear: '2025–26',
  officialIds: ['DEMO-SCHOOL-2025-041', 'DEMO-TENDER-017', 'DEMO-WO-2025-017'],
  location: [77.5865608, 12.9498004],
  locationPrecision: 'source_point',
  authority: 'Demonstration Parks and Public Spaces Office (fictional)',
  authorityReceipt: sanction,
  demo: true,
  physicalVerification:
    'Fictional completion certificate shown for interface demonstration only. No real site has been inspected.',
  summary: `${notice} Fictional purpose: create accessible garden paths, seating and visitor toilets. This imagined project is placed at Lalbagh for visual demonstration; it is not an account of actual work there.`,
  stages: [
    {
      id: 'sanction',
      label: 'Administrative sanction',
      state: 'found',
      date: '2025-04-12',
      amount: '5000000.00',
      description: 'Fictional sanctioned amount ₹50,00,000.',
      receipts: [sanction],
    },
    {
      id: 'award',
      label: 'Contract awarded',
      state: 'found',
      date: '2025-05-28',
      amount: '4600000.00',
      description: 'Fictional contract ₹46,00,000 awarded to the fictional contractor.',
      receipts: [contract],
    },
    {
      id: 'payment',
      label: 'Payments recorded',
      state: 'found',
      date: '2025-12-12',
      amount: '4450000.00',
      description:
        'Three fictional net transfers total ₹44,50,000. Fictional gross bills total ₹46,00,000; fictional deductions total ₹1,50,000.',
      receipts: paymentReceipts,
    },
    {
      id: 'completion',
      label: 'Completion reported',
      state: 'found',
      date: '2026-01-31',
      amount: null,
      description: 'Fictional completion certificate; no independent physical inspection.',
      completionBasis: 'certificate',
      receipts: [completion],
    },
  ],
  money: [
    {
      id: 'demo-school-sanction-value',
      measure: 'sanction',
      amount: '5000000.00',
      kind: 'transaction',
      canonicalId: 'demo-school-sanction-value',
      date: '2025-04-12',
      receiptId: sanction.id,
      approved: true,
    },
    {
      id: 'demo-school-contract-value',
      measure: 'contract',
      amount: '4600000.00',
      kind: 'transaction',
      canonicalId: 'demo-school-contract-value',
      date: '2025-05-28',
      receiptId: contract.id,
      approved: true,
    },
    ...payments.map((p, i) => ({
      id: p.id,
      measure: 'payment' as const,
      amount: p.net,
      kind: 'transaction' as const,
      canonicalId: p.id,
      date: p.date,
      receiptId: paymentReceipts[i].id,
      approved: true,
      sourcePaymentId: p.ref,
      amountBasis: 'net' as const,
      flow: 'contractor_payment' as const,
      payee: 'Neela Rao (fictional)',
    })),
  ],
  roles: [
    {
      id: 'demo-recipient-1',
      name: 'Neela Rao',
      role: 'Successful bidder and fictional payment recipient',
      organisation: 'Sampurna Civic Works (fictional)',
      receipt: contract,
      photoUrl: '/images/demo/neela-rao-portrait.png',
      photoSource: 'AI-generated fictional portrait; not a real official or recipient',
    },
  ],
  demoProfile: {
    recipientAddress:
      'Suite 204, Sample Civic Centre, Example Road, Bengaluru, Karnataka · fictional address',
    recipientPhone: '+91 9XXXX XXXXX · sample, not dialable',
    recipientEmail: 'accounts@sampurna.example.invalid',
    registration: 'DEMO-REG-000 (fictional; not a valid registration)',
    mappedLocality: 'Lalbagh Glasshouse, Mavalli, Bengaluru, Karnataka 560004, India',
    mappedLocalitySource: 'https://www.openstreetmap.org/node/347241683',
    paymentBreakdown: payments.map((p) => ({
      paymentId: p.ref,
      date: p.date,
      gross: p.gross,
      deductions: p.deductions,
      net: p.net,
    })),
    notice,
  },
};
