'use client';
import { NationalEvidenceCoverage, type NationalCoverage } from './national-evidence-coverage';
import { DelhiEvidenceCoverage, type DelhiCoverage } from './delhi-evidence-coverage';
import { PpmsLocationReview } from './ppms-location-review';
import { MpladsCatalogue } from './mplads-catalogue';
import { MpladsPilotReview } from './mplads-pilot-review';
import { EvidenceRequests } from './evidence-requests';
import { DepartmentExportReview } from './department-export-review';
import {
  StateDevelopmentReview,
  type StateDevelopmentCollection,
} from './state-development-review';
import { PanchayatEvidenceReview } from './panchayat-evidence-review';
import { useEffect, useState } from 'react';
type Progress = {
  stateDevelopmentCollection?: StateDevelopmentCollection;
  unionTerritoryDevelopmentCollection?: StateDevelopmentCollection;
  delhiCoverage?: DelhiCoverage | null;
  nationalCoverage?: NationalCoverage | null;
  updatedOn: string;
  lanes: { id: string; title: string }[];
  tasks: {
    id: string;
    lane: string;
    title: string;
    owner: string;
    status: string;
    blocker: string;
    nextAction: string;
    followUpOn: string | null;
    supportingRecord: string;
  }[];
  projects: {
    id: string;
    title: string;
    packageId: string;
    district: string;
    checks: Record<string, string>;
    nextAction: string;
  }[];
  milestones: { id: string; name: string; status: string }[];
  notes: string[];
};
export function EvidenceProgress() {
  const [data, setData] = useState<Progress | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/evidence-progress', { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error('Evidence progress unavailable');
        setData(await r.json());
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, []);
  return (
    <section className="evidence-progress">
      <h3>Evidence progress</h3>
      <p>Four routes to verified spending: collect → connect → check → owner review → publish.</p>
      {!data && <p role="status">{error || 'Loading progress…'}</p>}
      {data && (
        <>
          <small>Updated {data.updatedOn} · No automatic emails scheduled</small>
          {data.stateDevelopmentCollection && (
            <StateDevelopmentReview data={data.stateDevelopmentCollection} />
          )}
          {data.unionTerritoryDevelopmentCollection && (
            <StateDevelopmentReview data={data.unionTerritoryDevelopmentCollection} territories />
          )}
          {data.delhiCoverage && <DelhiEvidenceCoverage data={data.delhiCoverage} />}
          {data.nationalCoverage && <NationalEvidenceCoverage data={data.nationalCoverage} />}
          <div className="evidence-lanes">
            {data.lanes.map((l) => (
              <section key={l.id}>
                <h4>{l.title}</h4>
                {data.tasks
                  .filter((t) => t.lane === l.id)
                  .map((t) => (
                    <details key={t.id}>
                      <summary>
                        {t.title}
                        <span>{t.status}</span>
                      </summary>
                      <p>Owner: {t.owner}</p>
                      <p>
                        <strong>Blocker:</strong> {t.blocker}
                      </p>
                      <p>
                        <strong>Next:</strong> {t.nextAction}
                      </p>
                      <p>Follow-up: {t.followUpOn ?? 'Not scheduled'}</p>
                      <small>{t.supportingRecord}</small>
                    </details>
                  ))}
              </section>
            ))}
          </div>
          <details>
            <summary>Ten-road pilot checklist</summary>
            {data.projects.map((p) => (
              <details key={p.id} className="road-evidence-case">
                <summary>{p.title}</summary>
                <p>
                  {p.district} · {p.packageId} · Road {p.id}
                </p>
                <dl>
                  {Object.entries(p.checks).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <p>{p.nextAction}</p>
              </details>
            ))}
          </details>
          <details>
            <summary>Milestones to nationwide coverage</summary>
            {data.milestones.map((m) => (
              <p key={m.id}>
                <strong>
                  {m.id} · {m.name}
                </strong>
                <br />
                {m.status}
              </p>
            ))}
          </details>
          <MpladsCatalogue />
          <MpladsPilotReview />
          <PanchayatEvidenceReview />
          <PpmsLocationReview />
          <DepartmentExportReview />
          <EvidenceRequests />
          {data.notes.map((n) => (
            <small key={n}>
              {n}
              <br />
            </small>
          ))}
        </>
      )}
    </section>
  );
}
