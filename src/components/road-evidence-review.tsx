'use client';
import { useState } from 'react';
import { formatMoney } from '@/lib/money';
type Case = {
  packageId: string;
  title: string;
  districtLabel: string;
  officialRoadId: string;
  sanctionAmount: string;
  reportedExpenditureAmount: string;
  reportedPhysicalCompletionDate: string;
  sanctionComparison: string;
  agreementNumber: string | null;
  contractSourceValueUnscaled: string;
  sourceLocator: string;
  sourceUrl: string;
  documentHash: string;
};
type Report = {
  manifest: { sha256: string; retrievedAt: string; policyUrl: string; limitations: string[] };
  cases: Case[];
};
export function RoadEvidenceReview() {
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/v1/admin/road-evidence');
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setReport(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="road-evidence-review">
      <h3>Collected road financial evidence</h3>
      <p>
        Official reported amounts are available for the first ten matched roads. They are awaiting
        review and excluded from published totals and map pins.
      </p>
      {!report && (
        <button className="secondary" disabled={loading} onClick={() => void load()}>
          {loading ? 'Loading evidence…' : 'Inspect ten road records'}
        </button>
      )}
      {error && (
        <p role="status">
          {error} <a href="/admin">Open owner sign-in</a>
        </p>
      )}
      {report && (
        <>
          <p>
            Source edition retrieved{' '}
            {new Date(report.manifest.retrievedAt).toLocaleDateString('en-IN')}. Expenditure is
            cumulative; contractor payment dates and payees are unavailable.
          </p>
          {report.manifest.limitations.map((s) => (
            <p className="info-note" key={s}>
              {s}
            </p>
          ))}
          <a href={'/api/v1/admin/road-evidence?original=' + report.manifest.sha256}>
            Download preserved official CSV
          </a>{' '}
          ·{' '}
          <a href={report.manifest.policyUrl} target="_blank" rel="noopener noreferrer">
            Reuse policy
          </a>
          {report.cases.map((c) => (
            <details key={c.officialRoadId} className="road-evidence-case">
              <summary>{c.title}</summary>
              <p>
                {c.districtLabel} · {c.packageId} · Road {c.officialRoadId}
              </p>
              <dl>
                <dt>Reported sanctioned cost</dt>
                <dd>{formatMoney(c.sanctionAmount)}</dd>
                <dt>Reported expenditure · cumulative</dt>
                <dd>{formatMoney(c.reportedExpenditureAmount)}</dd>
                <dt>Reported physical completion</dt>
                <dd>{c.reportedPhysicalCompletionDate} · no completion certificate acquired</dd>
                <dt>Agreement identifier in the earlier road report</dt>
                <dd>{c.agreementNumber || 'Not available'}</dd>
                <dt>Agreement value in the earlier road report</dt>
                <dd>
                  {c.contractSourceValueUnscaled} · unit not verified; not converted to rupees
                </dd>
                <dt>Individual payments / dates / payee</dt>
                <dd>Not available</dd>
              </dl>
              {c.sanctionComparison !== 'exact_numeric_match' && (
                <div className="info-note">
                  Sanctioned cost differs between the two official reports. A revision or scope
                  difference needs evidence before reconciling these figures.
                </div>
              )}
              <p>{c.sourceLocator}</p>
              <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">
                Open official report · select 2020–2021 pending works
              </a>
              <small className="asset-hash">Original SHA-256: {c.documentHash}</small>
            </details>
          ))}
        </>
      )}
    </section>
  );
}
