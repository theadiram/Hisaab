import type { Work } from './model';
import { completeCardDemo } from './complete-card-demo';

export const roadAssetId = '3ee86e5b6e685a5fe00c:16';
// Isolated presentation fixture. Never ingested into reviewed works or payments.
export const roadCardDemo: Work = {
  ...completeCardDemo,
  id: 'demo-road-redevelopment-card',
  assetId: roadAssetId,
  title: 'Road redevelopment · NH-4 to Beerenahalli',
  purpose: 'Roads',
  district: 'Yaradakatte–Beerenahalli corridor',
  financialYear: '2025–26',
  location: [76.5844865544, 13.9910102942],
  areaId: 'showcase-road-area',
  authority: 'Road Infrastructure Office',
  officialIds: ['SAMPLE-RD-2025-041', 'SAMPLE-TENDER-017', 'SAMPLE-WO-2025-017'],
  summary:
    'Road resurfacing, pothole repairs, side drainage, shoulder strengthening and road markings. Illustrative financial scenario at an archived road coordinate.',
  stages: completeCardDemo.stages.map((s) => ({
    ...s,
    receipts: s.receipts.map((r) => ({
      ...r,
      rawText: r.rawText
        .replaceAll('Neela Rao', 'Arun Mehra')
        .replaceAll('Sampurna Civic Works', 'Valley Civic Works')
        .replaceAll('garden', 'road')
        .replaceAll('Lalbagh', 'NH-4 to Beerenahalli'),
    })),
    description:
      s.id === 'sanction'
        ? 'Road redevelopment provision ₹50,00,000.'
        : s.id === 'award'
          ? 'Resurfacing and drainage contract ₹46,00,000.'
          : s.id === 'payment'
            ? 'Three net instalments total ₹44,50,000; gross bills ₹46,00,000 less deductions ₹1,50,000.'
            : 'Completion certificate scenario; physical condition not independently verified.',
  })),
  roles: [
    {
      ...completeCardDemo.roles![0],
      id: 'sample-road-contractor',
      name: 'Arun Mehra',
      role: 'Award recipient · contractor',
      organisation: 'Valley Civic Works',
      photoUrl: '/images/demo/arun-road-portrait-casual.png',
    },
  ],
  money: completeCardDemo.money.map((e) => ({
    ...e,
    id: 'road-' + e.id,
    canonicalId: 'road-' + e.canonicalId,
    payee: e.measure === 'payment' ? 'Arun Mehra' : e.payee,
  })),
  demoProfile: {
    ...completeCardDemo.demoProfile!,
    recipientAddress: 'Unit 12, Example Trade Centre, Sample Market Road, Karnataka',
    recipientPhone: '+91 9XXXX XXXXX',
    recipientEmail: 'office@valleycivic.example.invalid',
    registration: 'SAMPLE-RD-026',
    mappedLocality:
      'NH-4 to Beerenahalli via Yaradakatte, Metikurke, Sooragondanahalli, Tavandi and Katanahatti · Karnataka · 13.991010° N, 76.584487° E',
    mappedLocalitySource:
      'https://www.openstreetmap.org/?mlat=13.9910102942&mlon=76.5844865544#map=17/13.9910102942/76.5844865544',
    paymentBreakdown: completeCardDemo.demoProfile!.paymentBreakdown.map((r, i) => ({
      ...r,
      paymentId: 'Sample payment ' + String(i + 1).padStart(2, '0'),
    })),
  },
  physicalVerification: 'Physical road condition has not been independently verified',
};
