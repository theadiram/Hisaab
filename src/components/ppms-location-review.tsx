'use client';
import { useState } from 'react';
import type { LocationReview } from '@/lib/ppms-location-review';
type Data = {
  records: LocationReview[];
  pendingObservedLinks: number;
  failures: number;
  scope: string;
};
export function PpmsLocationReview() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState<LocationReview | null>(null),
    [page, setPage] = useState(1);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/v1/admin/ppms-locations', { cache: 'no-store' });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setData(body);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Evidence unavailable');
    } finally {
      setLoading(false);
    }
  }
  const filtered =
    data?.records.filter((r) =>
      [r.projectCode, r.title, r.panchayat, r.village]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase()),
    ) ?? [];
  return (
    <section aria-label="Project location evidence">
      <h4>Road and panchayat locations · Owner review</h4>
      <p>
        Inspect source photo locations linked to bills by exact project code. These coordinates need
        site review; treasury status does not establish recipient settlement.
      </p>
      <button className="secondary" disabled={loading} onClick={() => void load()}>
        {loading ? 'Loading evidence…' : 'Inspect collected locations'}
      </button>
      {error && (
        <p role="alert">
          {error} <a href="/admin">Owner sign-in</a>
        </p>
      )}
      {data && (
        <>
          <p>
            {data.records.length} project dossiers · {data.pendingObservedLinks} observed links
            pending · {data.failures} collection failures
          </p>
          <label>
            Project, purpose, panchayat or village
            <input
              value={query}
              maxLength={100}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {filtered.slice((page - 1) * 20, page * 20).map((r) => (
            <button className="secondary" key={r.projectCode} onClick={() => setSelected(r)}>
              {r.title}
              <br />
              {r.panchayat} · {r.locations.length} photo locations · {r.bills.length} source bills
            </button>
          ))}
          <p>
            Page {page} · {filtered.length} matching projects
          </p>
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous projects
          </button>{' '}
          <button disabled={page * 20 >= filtered.length} onClick={() => setPage(page + 1)}>
            Next projects
          </button>
          {selected && (
            <article className="road-evidence-case">
              <h5>{selected.title}</h5>
              <p>
                {selected.projectCode}
                <br />
                {selected.panchayat} · {selected.village} · {selected.district}
              </p>
              <div aria-label="Project evidence checklist">
                <h6>What we have for this project</h6>
                <p>
                  {selected.coverage.sourceLocations} source photo locations ·{' '}
                  {selected.coverage.billDocuments} bill documents ·{' '}
                  {selected.coverage.visibleBillComponents} visible component tables
                </p>
                <p>
                  {selected.coverage.clippedDocumentsRecovered} clipped document tables recovered ·{' '}
                  {selected.coverage.clippedDocumentsPending} still awaiting recovery
                  <br />
                  {selected.coverage.missingOriginalChequeDates} documents lack an original cheque
                  date · {selected.coverage.failedBills} failed source bills
                  <br />
                  Verified site and recipient settlement: unavailable
                </p>
                <h6>Still needed before a verified spending card</h6>
                <ul>
                  {selected.missingEvidence.map((gap, i) => (
                    <li key={i}>{gap}</li>
                  ))}
                </ul>
              </div>
              <p>
                Purpose: {selected.purpose}
                <br />
                Portal work status: {selected.sourceWorkStatus}
                <br />
                Reported physical completion: {selected.sourceCompletionDate || 'Unavailable'} ·
                Certificate review pending
              </p>
              {selected.bills.map((b, i) => (
                <p key={i}>
                  <strong>{b.billSerial}</strong> · {b.financialYear}
                  <br />
                  Source expenditure: {b.amount} · Units and gross/net meaning unconfirmed
                  <br />
                  {b.sourceStatus}
                  <br />
                  Actual payment date and recipient: unavailable
                </p>
              ))}
              {selected.billBreakdowns.map((b, i) => (
                <div key={i}>
                  <h6>Official bill components · {b.billSerial}</h6>
                  <p>
                    Source component total: {b.beneficiarySum} · Matches report amount:{' '}
                    {b.matchesReportAmount ? 'Yes' : 'No'}
                  </p>
                  {b.recipients.map((r, j) => (
                    <p key={j}>
                      {r.component} · {r.amount}
                      <br />
                      {r.sourceName} · Portal status: {r.sourcePaymentStatus}
                    </p>
                  ))}
                  <p>{b.interpretation}</p>
                  <a href={b.sourceUrl} target="_blank" rel="noreferrer">
                    Official bill-detail source
                  </a>
                  <p>
                    Portal status and component arithmetic do not independently verify recipient
                    settlement.
                  </p>
                </div>
              ))}
              {selected.paymentDocuments.map((p, i) => (
                <div key={i}>
                  <h6>Bill-linked cheque document · {p.billSerial}</h6>
                  <p>
                    Cheque date: {p.cheque?.chequeDate ?? 'Unavailable'} · Cheque amount:{' '}
                    {p.cheque?.chequeAmount ?? 'Unavailable'}
                    <br />
                    Cheque date is not confirmed settlement date. Amount units and allocation
                    require review.
                    <br />
                    Cheque matches report amount: {p.chequeMatchesReportAmount ? 'Yes' : 'No'} ·
                    Beneficiary totals match cheque: {p.beneficiariesMatchCheque ? 'Yes' : 'No'}
                    {p.layoutClipped ? ' · Source amount column clipped' : ''}
                  </p>
                  {p.recipients.map((r, j) => (
                    <p key={j}>
                      {r.sourceName} · Source role: {r.sourceRole}
                      <br />
                      Source beneficiary amount: {r.amount ?? 'Unavailable'} · Final recipient role
                      unverified
                    </p>
                  ))}
                  <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                    Official bill-linked document
                  </a>
                </div>
              ))}
              {selected.locations.map((l, i) => (
                <p key={i}>
                  {l.stage ?? 'Stage unspecified'} · {l.sourceDate ?? 'Date unavailable'} · Source
                  status: {l.sourceStatus ?? 'Unavailable'}
                  <br />
                  {l.latitude}, {l.longitude} · Actual site not independently verified
                </p>
              ))}
              <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                Official photo-location source
              </a>
              <p>
                <small>Preserved original SHA-256: {selected.sourceHash}</small>
              </p>
              <p>
                Unpublished evidence. Contract, payment allocation, recipient roles, reuse
                conditions and actual site review remain outstanding.
              </p>
            </article>
          )}
        </>
      )}
    </section>
  );
}
