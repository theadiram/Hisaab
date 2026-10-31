'use client';
import { useState } from 'react';
import type {
  SafeTreasuryFlow,
  SafeBillBreakdown,
  SafePaymentReview,
} from '@/lib/panchayat-evidence';
type Candidate = {
  project: {
    projectCode: string;
    project: Record<string, string>;
    bills: Record<string, string>[];
  };
  geotags: {
    stage: string | null;
    latitude: string;
    longitude: string;
    sourceDate: string | null;
    sourceStatus: string | null;
  }[];
  source: { url: string };
  payments: SafePaymentReview[];
  billBreakdowns: SafeBillBreakdown[];
  treasuryFlows: SafeTreasuryFlow[];
  photos: { sha256: string; sourceStage: string; sourceDate: string; visualObservation: string }[];
  geographyReview: { maximumSpreadMetres: number; issues: string[]; arithmeticReconciles: boolean };
};
function available(value: string | undefined) {
  return !value || value === '-' ? 'Not available' : value;
}
export function PanchayatEvidenceReview() {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/v1/admin/panchayat-evidence');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setCandidates(body.candidates);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <section>
      <h4>Panchayat project and bill review</h4>
      <p>
        Five candidates assessed. Chandanbhati is the working pilot: its source bill, cheque and
        recipient totals reconcile. No candidate is approved for publication.
      </p>
      {!candidates && (
        <button className="secondary" disabled={loading} onClick={() => void load()}>
          {loading ? 'Loading evidence…' : 'Open private project evidence'}
        </button>
      )}
      {error && (
        <p role="status">
          {error} <a href="/admin">Owner sign-in</a>
        </p>
      )}
      {candidates?.map((c) => (
        <details key={c.project.projectCode} className="road-evidence-case">
          <summary>{c.project.project['Project Name']}</summary>
          <p>
            {c.project.project['Gram Panchayat / Ulb']} · {c.project.projectCode}
          </p>
          <dl>
            {[
              'Village / Ward',
              'Scheme Name',
              'Technical Sanction Date',
              'Administrative Approval Date',
              'Work Started Date',
              'Physically Completed Date',
              'Final Bill Date',
              'Executant in favour of Work order',
            ].map((k) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{available(c.project.project[k])}</dd>
              </div>
            ))}
          </dl>
          <p>
            Executant is a source field, not a confirmed contractor recipient. Final bill date is
            not a payment date.
          </p>
          {c.project.bills.map((b, i) => (
            <p key={i}>
              <strong>Bill {b['Bill Serial No'] || b['Bill No']}</strong>
              <br />
              Source expenditure field: {b['Total Expenditure Amount']} · unit and gross/net basis
              pending
              <br />
              Source status: {b.Status}
            </p>
          ))}
          {c.treasuryFlows.map((f) => (
            <section key={'flow-' + f.billSerial}>
              <h5>Official bill and treasury history</h5>
              <p>{f.dateBasis}</p>
              <dl>
                {f.events.map((e) => (
                  <div key={e.serial}>
                    <dt>
                      {e.sourceDate} · {e.event}
                    </dt>
                    <dd>{e.sourceText}</dd>
                  </div>
                ))}
              </dl>
              <p>{f.columnWarning}</p>
              <p>
                These events belong to bill {f.billSerial}. They do not establish individual
                recipient settlement dates.
              </p>
              <a href={f.sourceUrl} target="_blank" rel="noreferrer">
                Official transaction report
              </a>
            </section>
          ))}
          {c.billBreakdowns.map((b) => (
            <section key={'visible-' + b.billSerial}>
              <h5>Visible official bill breakdown · {b.billSerial}</h5>
              <p>
                Source recipient sum: {b.beneficiarySum} · report amount: {b.reportAmount}
                <br />
                {b.matchesReportAmount
                  ? 'The visible breakdown matches the bill report.'
                  : 'The visible breakdown differs from the bill report; discrepancy retained.'}
              </p>
              <p>{b.interpretation}</p>
              <details>
                <summary>Recipient amounts from the official dialog</summary>
                <dl>
                  {b.recipients.map((r) => (
                    <div key={r.serial}>
                      <dt>{r.sourceName}</dt>
                      <dd>
                        {r.amount} · {r.component === '-' ? 'Component unspecified' : r.component} ·
                        Source status: {r.sourcePaymentStatus}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
              <p>
                These amounts come from the visible dialog, separately from the PDF. Amount basis,
                recipient roles and settlement remain unverified. Do not add this breakdown to the
                bill or cheque amount.
              </p>
              <a href={b.sourceUrl} target="_blank" rel="noreferrer">
                Official transaction report
              </a>
            </section>
          ))}
          {c.payments.map((p) => (
            <section key={p.billSerial}>
              <h5>Official cheque record · {p.billSerial}</h5>
              <p>
                Cheque date: {p.cheque?.chequeDate || 'Unavailable'} · cheque{' '}
                {p.cheque?.chequeNumber || 'Unavailable'}
                <br />
                Source cheque amount: {p.cheque?.chequeAmount || 'Unavailable'}
                <br />
                {p.chequeMatchesReportAmount
                  ? 'Cheque amount matches the source report.'
                  : 'Cheque amount differs from the bill report; allocation needs reconciliation.'}
              </p>
              <p>
                {p.layoutClipped
                  ? 'The official PDF clips its beneficiary amount column. Individual amounts remain unavailable.'
                  : `Source beneficiary sum: ${p.beneficiarySum}. ${p.beneficiariesMatchCheque ? 'Matches cheque amount.' : 'Differs from cheque amount; correction evidence needed.'}`}
              </p>
              <details>
                <summary>Source beneficiary breakdown · roles awaiting review</summary>
                <dl>
                  {p.recipients.map((r) => (
                    <div key={r.serial}>
                      <dt>{r.sourceName}</dt>
                      <dd>
                        {r.amount ?? 'Amount unavailable'} ·{' '}
                        {r.component && r.component !== '-' ? r.component : r.sourceRole}
                        {r.sourcePaymentStatus &&
                          ` · Source payment status: ${r.sourcePaymentStatus}`}{' '}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p>
                  Bank and phone fields excluded. These source beneficiaries are not all contractor
                  payments; do not add the breakdown to the cheque total.
                </p>
              </details>
              <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                Official cheque document
              </a>
            </section>
          ))}
          <details>
            <summary>Evidence still needed</summary>
            {c.geographyReview.issues.map((issue) => (
              <p key={issue}>{issue}</p>
            ))}
          </details>
          <details>
            <summary>
              {c.geotags.length} reported photo locations · {c.geographyReview.maximumSpreadMetres}{' '}
              m maximum spread
            </summary>
            {c.geotags.map((g, i) => (
              <p key={i}>
                {g.stage || 'Stage unknown'} · {g.latitude}, {g.longitude}
                <br />
                Source photo date: {g.sourceDate || 'Unavailable'} · source status:{' '}
                {g.sourceStatus || 'Unavailable'}
                <br />
                Site/route review pending; photo dates are not payment dates.
              </p>
            ))}
          </details>
          <details>
            <summary>Preserved source photo · private review</summary>
            {c.photos.map((photo) => (
              <figure key={photo.sha256}>
                <img
                  src={'/api/v1/admin/panchayat-evidence?photo=' + photo.sha256}
                  alt={
                    'Official ' +
                    photo.sourceStage +
                    ' photo for ' +
                    c.project.project['Project Name']
                  }
                  loading="lazy"
                  style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 12 }}
                />
                <figcaption>
                  {photo.sourceStage} · source date {photo.sourceDate}. {photo.visualObservation}{' '}
                  Source photo does not independently verify the site or completion.
                </figcaption>
              </figure>
            ))}
          </details>
          <a href={c.source.url} target="_blank" rel="noreferrer">
            Official project and photo report
          </a>
        </details>
      ))}
    </section>
  );
}
