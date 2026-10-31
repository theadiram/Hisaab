import { readFile } from 'node:fs/promises';
import path from 'node:path';
export async function GET() {
  try {
    const stored = JSON.parse(
      await readFile(path.join(process.cwd(), 'data/nationwide-ingestion.json'), 'utf8'),
    );
    // Only acquisition counts and status are public. Raw source responses,
    // internal errors, unpublished candidates and source hashes stay private.
    const progress = {
      retrievedAt: stored.retrievedAt,
      sourceUrl: stored.sourceUrl,
      uniqueSourceWorks: stored.uniqueSourceWorks,
      withinYearWindow: stored.withinYearWindow,
      normalizedCandidates: stored.normalizedCandidates ?? 0,
      hostedCandidatesProcessed: stored.hostedCandidatesProcessed ?? 0,
      statePartitions: stored.statePartitions.map(
        (s: {
          state: string;
          status: string;
          uniqueSourceWorks?: number;
          withinYearWindow?: number;
        }) => ({
          state: s.state,
          status: s.status,
          uniqueSourceWorks: s.uniqueSourceWorks,
          withinYearWindow: s.withinYearWindow,
        }),
      ),
    };
    let geography = null;
    try {
      const g = JSON.parse(
        await readFile(path.join(process.cwd(), 'data/geography-status.json'), 'utf8'),
      );
      geography = {
        districtsExpected: g.districtsExpected,
        statesExpected: g.statesExpected,
        registryDate: g.registryDate,
        sourceUrl: g.sourceUrl,
        matchingCandidates: g.matchingCandidates,
        unmatchedCandidates: g.unmatchedCandidates,
        districtsWithCandidateMatches: g.districtsWithCandidateMatches,
        hostedRegistryImported: g.hostedRegistryImported,
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    let assets = null;
    try {
      const a = JSON.parse(
        await readFile(path.join(process.cwd(), 'data/geosadak-acquisition.json'), 'utf8'),
      );
      const m = JSON.parse(
        await readFile(path.join(process.cwd(), 'data/geography-match-status.json'), 'utf8'),
      );
      assets = {
        edition: a.edition,
        assetRows: a.assetRows,
        stateFiles: a.stateFiles,
        originalArchives: a.originalArchives,
        byKind: a.byKind,
        quarantinedRows: a.quarantinedRows,
        textEncodingReview: a.textEncodingReview,
        proposedRoadLinks: m.counts.projectsWithExactAttributeProposals,
        approvedPaymentLinks: m.approvedPaymentLinks,
        locationVerification: 'unreviewed_source_coordinate',
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    return Response.json(
      { progress, geography, assets, publication: 'pending_review' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return Response.json({ progress: null });
    return Response.json({ error: 'Acquisition status unavailable' }, { status: 503 });
  }
}
