import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { financialCoverage } from './financial-coverage';
const sectors = [
  {
    id: 'railways',
    name: 'Railways',
    description: 'Stations, tracks, bridges and railway facilities.',
    demands: [85],
    next: 'Connect sanctioned railway projects, contracts and payment evidence.',
  },
  {
    id: 'roads',
    name: 'Roads & bridges',
    description: 'National highways, rural roads and their maintenance.',
    demands: [86, 87],
    next: 'Review PMGSY works and acquire highway and state road records.',
  },
  {
    id: 'water',
    name: 'Water',
    description: 'Drinking water, irrigation and water infrastructure.',
    demands: [62, 63],
    next: 'Connect state financial context to individual water schemes and works.',
  },
  {
    id: 'sanitation',
    name: 'Sanitation',
    description: 'Toilets, drainage, sewerage and waste systems.',
    demands: [60, 63],
    next: 'Acquire rural and urban sanitation work and expenditure registers.',
  },
  {
    id: 'health',
    name: 'Hospitals & health',
    description: 'Hospitals, clinics, medical facilities and equipment.',
    demands: [4, 46, 47],
    next: 'Connect health department approvals to facility contracts and bills.',
  },
  {
    id: 'education',
    name: 'Schools & education',
    description: 'Schools, colleges, classrooms and learning facilities.',
    demands: [25, 26],
    next: 'Acquire education infrastructure approvals and institution-level works.',
  },
  {
    id: 'housing',
    name: 'Housing',
    description: 'Public housing, rural homes and urban housing programmes.',
    demands: [60, 87],
    next: 'Acquire housing programme instalment evidence with beneficiary privacy.',
  },
  {
    id: 'urban',
    name: 'Cities & public spaces',
    description: 'Urban infrastructure, parks, streets and public facilities.',
    demands: [60],
    next: 'Connect municipal budgets, work orders, measurement books and bills.',
  },
  {
    id: 'energy',
    name: 'Energy',
    description: 'Electricity networks, public energy systems and renewables.',
    demands: [71, 79],
    next: 'Acquire implementing agency projects and procurement/payment records.',
  },
  {
    id: 'transport',
    name: 'Airports, ports & transport',
    description: 'Public transport facilities, ports and airports.',
    demands: [8, 78],
    next: 'Acquire authority-level capital works and contracts.',
  },
  {
    id: 'rural',
    name: 'Rural & local development',
    description: 'Village assets, employment works and local infrastructure.',
    demands: [72, 87],
    next: 'Acquire panchayat and rural scheme accounts through permitted routes.',
  },
  {
    id: 'digital',
    name: 'Digital infrastructure',
    description: 'Public connectivity and digital infrastructure.',
    demands: [13, 27],
    next: 'Connect programme allocations to infrastructure contracts and delivery.',
  },
];
// Keep source-summary paths literal so deployment tracing cannot include private originals.
async function saved(contents: Promise<string>) {
  try {
    return JSON.parse(await contents);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}
export async function spendingCoverage() {
  const [budget, roads, water, financial, roadAudit, roadFinancial, bankPaymentsRaw, outreach] =
    await Promise.all([
      saved(readFile(path.join(process.cwd(), 'data/union-budget-acquisition.json'), 'utf8')),
      saved(readFile(path.join(process.cwd(), 'data/nationwide-ingestion.json'), 'utf8')),
      saved(readFile(path.join(process.cwd(), 'data/jjm-acquisition.json'), 'utf8')),
      financialCoverage(),
      saved(readFile(path.join(process.cwd(), 'data/road-evidence-audit.json'), 'utf8')),
      saved(readFile(path.join(process.cwd(), 'data/road-financial-acquisition.json'), 'utf8')),
      saved(readFile(path.join(process.cwd(), 'data/bank-payment-acquisition.json'), 'utf8')),
      saved(readFile(path.join(process.cwd(), 'data/source-outreach.json'), 'utf8')),
    ]);
  const bankPayments = bankPaymentsRaw
    ? Object.fromEntries(Object.entries(bankPaymentsRaw).filter(([key]) => key !== 'documentHash'))
    : null;
  const checked = new Set<number>(budget?.checkedDemandNumbers ?? []);
  return {
    financial,
    roadAudit,
    roadFinancial,
    bankPayments,
    outreach,
    scope: 'India-wide development spending across Union, state and local government',
    publication: 'collection_and_review_in_progress',
    budget: budget
      ? {
          edition: budget.edition,
          demandStatements: budget.demandStatements,
          pdfCheckedDemands: budget.pdfCheckedDemands,
          financialContextRows: budget.financialContextRows,
          quarantinedDemands: budget.quarantinedDemands,
          originalDocuments: budget.originalDocuments,
          hostedOriginalsVerified: budget.hostedOriginalsVerified,
          hostedContextRows: budget.hostedContextRows,
          publication: budget.publication,
        }
      : null,
    sectors: sectors.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      budgetDemandsCollected: s.demands.filter((d) => checked.has(d)).length,
      workCandidates: s.id === 'roads' ? (roads?.hostedCandidatesProcessed ?? 0) : null,
      stateFinancialContextRows: s.id === 'water' ? (water?.sourceRows ?? 0) : null,
      next: s.next,
    })),
    limitations: [
      'Department budgets include expenditure beyond development projects.',
      'Some departments serve multiple sectors; their budgets must not be added across sector cards.',
      'Budget estimates, transfers and project payments are different measures.',
      'A national project/payment ledger is still being acquired and reviewed.',
    ],
  };
}
