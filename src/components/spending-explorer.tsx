'use client';
import { EvidenceProgress } from './evidence-progress';
import { RoadEvidenceReview } from './road-evidence-review';
import { BankEvidenceReview } from './bank-evidence-review';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  TrainFront,
  Route,
  Waves,
  HeartPulse,
  GraduationCap,
  House,
  Trash2,
  Trees,
  Zap,
  Bus,
  Landmark,
  Wifi,
} from 'lucide-react';
import type { Catalogue } from '@/lib/model';
type Sector = {
  id: string;
  name: string;
  description: string;
  budgetDemandsCollected: number;
  workCandidates: number | null;
  stateFinancialContextRows: number | null;
  next: string;
};
type Coverage = {
  outreach: {
    requests: { custodian: string; sentOn: string; status: string; purpose: string }[];
  } | null;
  bankPayments: {
    recordsPreserved: number;
    projectAllocations: number;
    scope: string;
    checkedAt: string;
  } | null;
  roadAudit: {
    counts: { projectsAudited: number; identityChecksPassed: number; agreementDatePresent: number };
    checkedAt: string;
  } | null;
  roadFinancial: {
    counts: {
      sourceRows: number;
      uniqueRoadMatches: number;
      sanctionValuesDifferBetweenReports: number;
    };
    checkedAt: string;
  } | null;
  financial: {
    publishedWorks: number;
    withFinancialRecords: number;
    withPaymentDetails: number;
    missingStages: Record<string, number>;
    lastPublishedAt: string | null;
    checkedAt: string;
    scope: string;
  };
  budget: { edition: string; pdfCheckedDemands: number; financialContextRows: number } | null;
  sectors: Sector[];
  limitations: string[];
};
const icons: Record<string, typeof Building2> = {
  railways: TrainFront,
  roads: Route,
  water: Waves,
  sanitation: Trash2,
  health: HeartPulse,
  education: GraduationCap,
  housing: House,
  urban: Trees,
  energy: Zap,
  transport: Bus,
  rural: Landmark,
  digital: Wifi,
};
export function SpendingExplorer({
  catalogue,
  onSources,
  onWorks,
}: {
  catalogue: Catalogue;
  onSources: () => void;
  onWorks: (purpose: string) => void;
}) {
  const [coverage, setCoverage] = useState<Coverage | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [sector, setSector] = useState<Sector | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void fetch('/api/v1/spending', { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error('Spending coverage could not be loaded.');
        setCoverage(await r.json());
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <div className="spending-explorer">
      <div className="eyebrow">INDIA · DEVELOPMENT SPENDING</div>
      <h2 id="dialog-title">{sector ? sector.name : 'Every purpose. Across India.'}</h2>
      {!coverage && <p role="status">{error || 'Loading source coverage…'}</p>}
      {error && (
        <button className="secondary" onClick={() => setAttempt((a) => a + 1)}>
          Try again
        </button>
      )}
      {coverage && (
        <>
          {sector ? (
            <>
              <button className="sector-back" onClick={() => setSector(null)}>
                <ArrowLeft size={16} />
                All development sectors
              </button>
              <p className="modal-intro">{sector.description}</p>
              <div className="spending-summary">
                <div>
                  <strong>{sector.budgetDemandsCollected}</strong>
                  <span>Union demand statements checked</span>
                </div>
                <div>
                  <strong>
                    {
                      catalogue.works.filter(
                        (w) =>
                          w.purpose ===
                          (sector.id === 'roads'
                            ? 'Roads'
                            : sector.id === 'water'
                              ? 'Water'
                              : sector.name),
                      ).length
                    }
                  </strong>
                  <span>Published works in the loaded catalogue</span>
                </div>
              </div>
              <div className="info-note">
                Budget context is collected privately and awaits permission and review. It is not
                evidence of a contractor payment.
              </div>
              {sector.workCandidates !== null && (
                <p>
                  {sector.workCandidates.toLocaleString('en-IN')} PMGSY work candidates saved
                  privately. Geography and publication review remain pending.
                </p>
              )}
              {sector.stateFinancialContextRows !== null && (
                <p>
                  {sector.stateFinancialContextRows} state/year financial context records preserved.
                  Individual work and payment links remain pending.
                </p>
              )}
              <h3>Next evidence needed</h3>
              <p>{sector.next}</p>
              <div className="spending-actions">
                <button
                  className="primary"
                  onClick={() =>
                    onWorks(
                      sector.id === 'roads'
                        ? 'Roads'
                        : sector.id === 'water'
                          ? 'Water'
                          : sector.name,
                    )
                  }
                >
                  Explore published works
                  <ArrowRight size={16} />
                </button>
                <button className="secondary" onClick={onSources}>
                  Inspect source coverage
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="modal-intro">
                Railway stations, toilets, roads, hospitals, schools and more. Explore the records
                and see where evidence is still needed.
              </p>
              <div className="spending-summary">
                <div>
                  <strong>{coverage.budget?.pdfCheckedDemands ?? 0}</strong>
                  <span>Union demand statements checked</span>
                </div>
                <div>
                  <strong>{catalogue.totalWorks.toLocaleString('en-IN')}</strong>
                  <span>Published works</span>
                </div>
                <div>
                  <strong>{catalogue.districtsExpected ?? '—'}</strong>
                  <span>Districts in the registry</span>
                </div>
              </div>
              <div className="info-note">
                {coverage.budget?.financialContextRows ?? 0} budget context records collected
                privately. Figures await permission and review. Nationwide work and payment coverage
                is still being built.
              </div>
              {coverage.roadAudit && (
                <div className="info-note">
                  <strong>
                    {coverage.roadAudit.counts.projectsAudited.toLocaleString('en-IN')} road
                    geography proposals checked
                  </strong>
                  <p>
                    {coverage.roadAudit.counts.identityChecksPassed.toLocaleString('en-IN')} passed
                    automated source identity and checksum checks. These checks do not approve map
                    locations or financial records.
                  </p>
                  {coverage.roadFinancial && (
                    <p>
                      {coverage.roadFinancial.counts.sourceRows} road-level sanctioned-cost and
                      cumulative-expenditure records collected and matched.{' '}
                      {coverage.roadFinancial.counts.sanctionValuesDifferBetweenReports} have
                      different sanctioned costs between official reports and need revision review.
                      Individual payment records are still missing.
                    </p>
                  )}
                </div>
              )}
              {coverage.bankPayments && (
                <div className="info-note">
                  <strong>
                    {coverage.bankPayments.recordsPreserved.toLocaleString('en-IN')} source-reported
                    bank-accepted payment records collected
                  </strong>
                  <p>
                    {coverage.bankPayments.scope}. {coverage.bankPayments.projectAllocations} are
                    linked to specific projects. Bill-to-road allocations, payees and net/gross
                    semantics are missing, so these records are excluded from spending dots and
                    totals.
                  </p>
                </div>
              )}
              {coverage.outreach && (
                <section className="financial-coverage">
                  <h3>Requests for missing evidence</h3>
                  {coverage.outreach.requests.map((r) => (
                    <p key={r.custodian}>
                      <strong>{r.custodian}</strong> · {r.status} · {r.sentOn}
                      <br />
                      {r.purpose}
                    </p>
                  ))}
                </section>
              )}
              <section className="financial-coverage">
                <h3>Financial evidence coverage</h3>
                <div className="spending-summary">
                  <div>
                    <strong>{coverage.financial.publishedWorks.toLocaleString('en-IN')}</strong>
                    <span>Published projects</span>
                  </div>
                  <div>
                    <strong>
                      {coverage.financial.withFinancialRecords.toLocaleString('en-IN')}
                    </strong>
                    <span>With approved financial records</span>
                  </div>
                  <div>
                    <strong>{coverage.financial.withPaymentDetails.toLocaleString('en-IN')}</strong>
                    <span>With individual payment details</span>
                  </div>
                </div>
                {coverage.financial.publishedWorks === 0 ? (
                  <p>
                    No spending-backed projects are published yet. Historical asset dots are an
                    optional reference layer and do not establish spending.
                  </p>
                ) : (
                  <p>
                    Projects missing a recorded stage: sanction{' '}
                    {coverage.financial.missingStages.sanction}, contract{' '}
                    {coverage.financial.missingStages.award}, payment{' '}
                    {coverage.financial.missingStages.payment}, completion{' '}
                    {coverage.financial.missingStages.completion}.
                  </p>
                )}
                <small>
                  Last publication:{' '}
                  {coverage.financial.lastPublishedAt
                    ? new Date(coverage.financial.lastPublishedAt).toLocaleDateString('en-IN')
                    : 'None yet'}{' '}
                  · Checked {new Date(coverage.financial.checkedAt).toLocaleDateString('en-IN')}
                </small>
                <p>{coverage.financial.scope}</p>
              </section>
              <EvidenceProgress />
              <div className="app-sector-grid">
                {coverage.sectors.map((s) => {
                  const Icon = icons[s.id] ?? Building2;
                  return (
                    <button key={s.id} onClick={() => setSector(s)}>
                      <span className="sector-mark">
                        <Icon size={23} />
                      </span>
                      <strong>{s.name}</strong>
                      <small>{s.description}</small>
                      <span className="sector-progress">
                        {s.budgetDemandsCollected} demand statements checked
                        <Chevron />
                      </span>
                    </button>
                  );
                })}
              </div>
              <button className="secondary full" onClick={onSources}>
                Inspect original sources and collection progress
                <ArrowRight size={16} />
              </button>
            </>
          )}
          <RoadEvidenceReview />
          <BankEvidenceReview />
          <details className="spending-limitations">
            <summary>How spending is counted</summary>
            <p>
              Budget → Funds released → Work approved → Contract → Payment evidence → Completion
              evidence.
            </p>
            <p>
              A transfer through several agencies is one funding chain. Its stages must not be added
              together as separate spending.
            </p>
            {coverage.limitations.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </details>
        </>
      )}
    </div>
  );
}
function Chevron() {
  return <ArrowRight size={14} aria-hidden="true" />;
}
