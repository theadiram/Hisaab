import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { publishedFunding } from '@/lib/funding-db';
import { fundingSelection, fundingMeasures } from '@/lib/funding';
export async function GET(request: Request) {
  let selection;
  try {
    selection = fundingSelection(
      new URLSearchParams({ year: new URL(request.url).searchParams.get('year') ?? '2026-2027' }),
    );
  } catch {
    return Response.json({ error: 'Invalid coverage year' }, { status: 400 });
  }
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const [original, queue] = await Promise.all([
      readFile(path.join(process.cwd(), 'data/funding-acquisition.json'), 'utf8'),
      readFile(path.join(process.cwd(), 'data/funding-source-ledger.json'), 'utf8'),
    ]);
    const data = JSON.parse(original),
      sourceLedger = JSON.parse(queue);
    // Reviewed counts are live; a stale saved zero cannot hide later owner publications.
    const reviewed = await Promise.allSettled(
      fundingMeasures.map((measure) => publishedFunding({ ...selection, measure })),
    );
    const matches = (
      r: { id: string; programmeId: string; channel: string; purpose: string },
      channel: string,
    ) =>
      r.programmeId === channel ||
      (channel === 'union-programme-lines' && r.id.startsWith('budget-row:')) ||
      (channel === 'capital-investment-loans' && r.channel === 'capital_loan') ||
      (channel === 'finance-commission-development' && r.channel === 'finance_commission') ||
      (channel === 'centrally-sponsored' && r.channel === 'centrally_sponsored') ||
      (channel === 'central-sector' && r.channel === 'central_sector') ||
      (channel === 'development-grants' && r.channel === 'development_grant') ||
      (channel === 'disaster-reconstruction' && r.purpose === 'disaster_reconstruction');
    for (const row of sourceLedger.rows) {
      for (let i = 0; i < fundingMeasures.length; i++) {
        const measure = fundingMeasures[i],
          result = reviewed[i];
        row.stages[measure].reviewedRecords =
          row.financialYear === selection.year && result.status === 'fulfilled'
            ? result.value.filter((r) => matches(r, row.programmeOrChannel)).length
            : null;
        if (
          row.financialYear === selection.year &&
          result.status === 'fulfilled' &&
          row.stages[measure].reviewedRecords > 0
        ) {
          row.stages[measure].status = 'reviewed_subset_with_gaps';
          row.status = 'reviewed_subset_with_gaps';
        }
      }
    }
    // Metadata only. Private source rows and financial amounts never pass this endpoint.
    return Response.json(
      {
        complete: false,
        updatedAt: data.updatedAt,
        publication: data.publication,
        editions: data.editions.map(
          (e: { financialYear: string; demands: number; lines: number; status: string }) => ({
            financialYear: e.financialYear,
            demands: e.demands,
            lines: e.lines,
            status: e.status,
          }),
        ),
        disasterRecords: data.disasterRecords,
        columnInterpretations: data.columnInterpretations
          ? {
              privateRows: data.columnInterpretations.privateRows,
              quarantinedRows: data.columnInterpretations.editions.reduce(
                (n: number, e: { quarantinedRows: number }) => n + e.quarantinedRows,
                0,
              ),
            }
          : null,
        boundary: { status: data.boundary.status },
        gaps: data.gaps,
        sourceLedger,
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'Funding coverage ledger unavailable' },
      { status: 503, headers },
    );
  }
}
