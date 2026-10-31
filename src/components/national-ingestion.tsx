'use client';
import { useEffect, useState } from 'react';
type Progress = {
  retrievedAt: string;
  sourceUrl: string;
  uniqueSourceWorks: number;
  withinYearWindow: number;
  normalizedCandidates: number;
  hostedCandidatesProcessed: number;
  statePartitions: {
    state: string;
    status: string;
    uniqueSourceWorks?: number;
    withinYearWindow?: number;
  }[];
};
type Geography = {
  districtsExpected: number;
  statesExpected: number;
  registryDate: string;
  matchingCandidates: number;
  unmatchedCandidates: number;
  districtsWithCandidateMatches: number;
  hostedRegistryImported: boolean;
};
type Assets = {
  edition: string;
  assetRows: number;
  stateFiles: number;
  originalArchives: number;
  byKind: Record<string, number>;
  proposedRoadLinks: number;
  approvedPaymentLinks: number;
};
export function NationalIngestion() {
  const [assets, setAssets] = useState<Assets | null>(null);
  const [geography, setGeography] = useState<Geography | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      void fetch('/api/v1/ingestion', { signal: controller.signal })
        .then(async (r) => {
          if (r.ok) {
            const data = await r.json();
            setProgress(data.progress);
            setGeography(data.geography);
            setAssets(data.assets);
          }
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 10000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  if (!progress) return <p>National source acquisition is being assessed.</p>;
  return (
    <section className="national-ingestion">
      <h3>Nationwide source acquisition</h3>
      <p>
        <strong>
          {progress.uniqueSourceWorks.toLocaleString('en-IN')} distinct source road records
        </strong>{' '}
        collected from{' '}
        {progress.statePartitions.filter((s) => s.status === 'original_preserved').length} PMGSY
        state/UT report partitions. {progress.withinYearWindow.toLocaleString('en-IN')} have
        sanction years in 2016–2026.
      </p>
      <p>
        <strong>
          {progress.hostedCandidatesProcessed.toLocaleString('en-IN')} of{' '}
          {progress.normalizedCandidates.toLocaleString('en-IN')} candidates saved to the private
          review queue.
        </strong>
      </p>
      <p>
        These originals await source permission, district matching and evidence review. They are
        excluded from published work and payment totals. PMGSY is one scheme; this does not cover
        every Indian tender or district.
      </p>
      <>
        {assets && (
          <div className="info-note">
            <strong>
              {assets.assetRows.toLocaleString('en-IN')} archived asset locations · {assets.edition}
            </strong>
            <p>
              {assets.byKind.education.toLocaleString('en-IN')} education facilities,{' '}
              {assets.byKind.health.toLocaleString('en-IN')} medical facilities and{' '}
              {assets.byKind.road.toLocaleString('en-IN')} road proposal features, alongside public
              and agricultural facilities. Collected from {assets.originalArchives} archives across{' '}
              {assets.stateFiles} historical state files through the DataMeet mirror.
            </p>
            <p>
              Use Asset locations on the map to inspect source points and road lines. Coordinates
              need independent accuracy review. This archive does not cover every current project or
              jurisdiction. {assets.proposedRoadLinks.toLocaleString('en-IN')} road project links
              are proposed for private review; {assets.approvedPaymentLinks} payment links are
              approved. Verified photos and building footprints are not available in this import.
            </p>
          </div>
        )}
        {geography && (
          <div className="info-note">
            <strong>
              Official LGD registry: {geography.districtsExpected} districts across{' '}
              {geography.statesExpected} states and union territories.
            </strong>
            <p>
              Registry dated {geography.registryDate}
              {geography.hostedRegistryImported
                ? ' · imported into the database'
                : ' · database import pending'}
              . {geography.matchingCandidates.toLocaleString('en-IN')} candidates have unique
              state-and-district name matches across {geography.districtsWithCandidateMatches}{' '}
              districts. {geography.unmatchedCandidates.toLocaleString('en-IN')} need further
              geography review. Name matches are proposals awaiting review, and do not establish
              work locations or published coverage.
            </p>
            <a href="https://lgdirectory.gov.in/" target="_blank" rel="noopener noreferrer">
              Source: Local Government Directory
            </a>
          </div>
        )}
      </>
      <div className="source-list">
        {progress.statePartitions.map((state) => (
          <article key={state.state}>
            <div>
              <strong>{state.state}</strong>
              <span className="status-label">
                {state.status === 'original_preserved'
                  ? 'Original collected'
                  : state.status === 'access_failed'
                    ? 'Retrieval failed'
                    : 'Response needs assessment'}
              </span>
            </div>
            <p>
              {(state.uniqueSourceWorks ?? 0).toLocaleString('en-IN')} distinct source road records
              · {(state.withinYearWindow ?? 0).toLocaleString('en-IN')} in the assessed year window
            </p>
          </article>
        ))}
      </div>
      <a href={progress.sourceUrl} target="_blank" rel="noopener noreferrer">
        Official PMGSY dashboard
      </a>
    </section>
  );
}
