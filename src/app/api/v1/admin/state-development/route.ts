import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { requireAdmin } from '@/lib/admin';
import { projectEvidenceCards, compareProjectCardFacts } from '@/lib/project-evidence-card';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    await requireAdmin();
  } catch {
    return Response.json(
      { error: 'Owner MFA sign-in required to inspect collected state evidence.' },
      { status: 401, headers },
    );
  }
  const params = new URL(request.url).searchParams;
  const register = params.get('register') ?? 'states';
  const code = params.get('state') ?? '',
    section = params.get('section') ?? 'sources',
    page = Number(params.get('page') ?? '1');
  if (
    [...params.keys()].some(
      (k) => !['state', 'section', 'page', 'register'].includes(k) || params.getAll(k).length !== 1,
    ) ||
    !['states', 'territories'].includes(register) ||
    !/^\d{1,2}$/.test(code) ||
    ![
      'sources',
      'budget',
      'expenditure',
      'projects',
      'cards',
      'reconciliation',
      'classification',
    ].includes(section) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 10000
  )
    return Response.json({ error: 'Invalid state evidence filters' }, { status: 400, headers });
  try {
    const summaryPath =
      register === 'territories'
        ? path.join(process.cwd(), 'data/union-territory-development-acquisition.json')
        : path.join(process.cwd(), 'data/state-development-acquisition.json');
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
    const state = summary.states.find((s: { code: string }) => s.code === code);
    if (!state)
      return Response.json(
        { error: 'Jurisdiction outside the selected collection scope' },
        { status: 400, headers },
      );
    const base =
      register === 'territories'
        ? path.join(process.cwd(), 'data/acquisition/union-territory-development', code)
        : path.join(process.cwd(), 'data/acquisition/state-development', code);
    let rows: unknown[] = [];
    if (section === 'sources') {
      const checkpoint = JSON.parse(await readFile(path.join(base, 'checkpoint.json'), 'utf8'));
      const versions = [
        ...checkpoint.documents.map((d: Record<string, unknown>) => ({
          ...d,
          editionStatus: 'current collected edition',
        })),
        ...(checkpoint.previousEditions ?? []).map((d: Record<string, unknown>) => ({
          ...d,
          editionStatus: 'earlier preserved edition; reconciliation required',
        })),
      ];
      rows = versions.map((d: Record<string, unknown>) => ({
        id: `${d.sourceId}:${d.sha256}:${d.url}`,
        label: d.label,
        kind: d.sourceKind,
        url: d.url,
        hash: d.sha256,
        retrievedAt: d.retrievedAt,
        bytes: d.bytes,
        extractedPages: d.extractedPages,
        completeExtraction: d.completeExtraction,
        permissionStatus: d.permissionStatus,
        editionStatus: d.editionStatus,
      }));
    } else if (section === 'reconciliation') {
      const report = JSON.parse(await readFile(path.join(base, 'reconciliation.json'), 'utf8'));
      rows = [
        {
          id: `reconciliation:${code}:${report.checkedAt}`,
          label: 'Extraction and reconciliation checks',
          checkedAt: report.checkedAt,
          identityCheck: report.identityCheck,
          tableControls: report.tableControls,
          scopeWarnings: report.scopeWarnings,
          overlapGroups: report.overlapGroups,
          remaining: report.remaining,
          completeCoverage: false,
          publicationApproved: false,
        },
      ];
    } else if (section === 'classification') {
      const report = JSON.parse(await readFile(path.join(base, 'classification.json'), 'utf8'));
      rows = report.rows;
    } else {
      try {
        const candidates = JSON.parse(await readFile(path.join(base, 'candidates.json'), 'utf8'));
        rows =
          (section === 'budget'
            ? candidates.budgetCandidates
            : section === 'expenditure'
              ? candidates.expenditureCandidates
              : candidates.projectCandidates) ?? [];
        if (section === 'cards') {
          let cards = projectEvidenceCards(rows as Record<string, unknown>[]);
          try {
            const comparison = JSON.parse(
              await readFile(
                path.join(
                  process.cwd(),
                  'data/acquisition/state-development/nhidcl-review/card-review-packets.json',
                ),
                'utf8',
              ),
            );
            cards = compareProjectCardFacts(cards, comparison);
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
          }
          cards.sort(
            (a, b) =>
              Number(b.sourceFactsComparison?.priority === 'contract_facts_first') -
              Number(a.sourceFactsComparison?.priority === 'contract_facts_first'),
          );
          rows = cards.map((card) => ({ id: card.id, card }));
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }
    return Response.json(
      {
        state,
        section,
        page,
        pageSize: 25,
        total: rows.length,
        rows: rows.slice((page - 1) * 25, page * 25),
        approved: false,
        scope:
          'Private source candidates. Budgets, project costs, contracts and payments remain distinct.',
      },
      { headers },
    );
  } catch {
    return Response.json(
      {
        error:
          'State evidence unavailable; collection is checkpointed and no missing value is treated as zero.',
      },
      { status: 503, headers },
    );
  }
}
