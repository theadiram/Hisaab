import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { delhiCoverage } from '@/lib/delhi-coverage';

// Public progress contains counts, never private money, people or local paths.
function collectionSummary(summary: Record<string, unknown>) {
  return {
    financialYears: summary.financialYears,
    updatedAt: summary.updatedAt,
    originals: summary.originals,
    pdfs: summary.pdfs,
    budgetCandidates: summary.budgetCandidates,
    expenditureCandidates: summary.expenditureCandidates,
    projectCandidates: summary.projectCandidates,
    statesWithBudgetCandidates: summary.statesWithBudgetCandidates,
    statesWithNamedBudgetCandidates: summary.statesWithNamedBudgetCandidates,
    completeStates: 0,
    states: (Array.isArray(summary.states) ? summary.states : []).map(
      (s: Record<string, unknown>) => ({
        code: s.code,
        name: s.name,
        order: s.order,
        originals: s.originals,
        pdfs: s.pdfs,
        blockedSources: s.blockedSources,
        status: s.status,
        nextAction: s.nextAction,
        budgetCandidates: s.budgetCandidates,
        namedBudgetCandidates: s.namedBudgetCandidates,
        budgetContextCandidates: s.budgetContextCandidates,
        expenditureCandidates: s.expenditureCandidates,
        projectCandidates: s.projectCandidates,
        financialYearCoverage: Array.isArray(s.financialYearCoverage)
          ? s.financialYearCoverage.map((y: Record<string, unknown>) => ({
              financialYear: y.financialYear,
              budgetCandidates: y.budgetCandidates,
              reportedExpenditureCandidates: y.reportedExpenditureCandidates,
              latestExpenditureCutoff: y.latestExpenditureCutoff,
              completeCoverage: false,
            }))
          : undefined,
      }),
    ),
  };
}

export async function GET() {
  try {
    const data = JSON.parse(
      await readFile(path.join(process.cwd(), 'data/evidence-progress.json'), 'utf8'),
    );
    if (data.delhiCoverage) data.delhiCoverage = delhiCoverage(data.delhiCoverage);
    for (const [key, file] of [
      ['stateDevelopmentCollection', 'state-development-acquisition.json'],
      ['unionTerritoryDevelopmentCollection', 'union-territory-development-acquisition.json'],
    ]) {
      try {
        data[key] = collectionSummary(
          JSON.parse(await readFile(path.join(process.cwd(), 'data', file), 'utf8')),
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(
      { error: 'Evidence progress unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
