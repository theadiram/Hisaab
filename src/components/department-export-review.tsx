'use client';
import { useState } from 'react';
import type { DepartmentExportReview as Review } from '@/lib/department-export-review';
export function DepartmentExportReview() {
  const [data, setData] = useState<Review | null>(null),
    [query, setQuery] = useState(''),
    [loadedQuery, setLoadedQuery] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  async function load(page = 1, search = query) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ q: search, page: String(page) }),
        r = await fetch(`/api/v1/admin/department-exports?${params}`, { cache: 'no-store' }),
        body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setData(body);
      setLoadedQuery(search);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Export review unavailable');
    } finally {
      setLoading(false);
    }
  }
  return (
    <section aria-label="Department payment export review">
      <h4>Department exports · Owner review</h4>
      <p>
        Review exact payment IDs and project shares across received exports. Repeated editions count
        once; conflicting amounts and overlapping allocations remain unresolved.
      </p>
      <button className="secondary" disabled={loading} onClick={() => void load()}>
        {loading ? 'Checking exports…' : 'Inspect department exports'}
      </button>
      {error && (
        <p role="alert">
          {error} <a href="/admin">Owner sign-in</a>
        </p>
      )}
      {data && (
        <>
          <p>
            {data.imports} preserved exports · {data.uniquePayments} distinct payment identities ·{' '}
            {data.conflictingPayments} conflicting identities · {data.quarantinedImportRows}{' '}
            quarantined input rows
          </p>
          <p>
            {data.imports === 0
              ? 'No official department export has been staged yet. The prepared source requests remain necessary.'
              : data.limitation}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load(1);
            }}
          >
            <label>
              Project, source or payment ID
              <input value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <button disabled={loading}>Search exports</button>
          </form>
          {data.records.map((r) => (
            <details key={r.canonicalId}>
              <summary>
                {r.sourceIdentity.join(' / ')} · {r.status}
              </summary>
              <p>
                Bill/voucher: {r.billVoucherId ?? 'Conflicting editions'} · {r.editionCount} source
                editions · {r.duplicateEditionsExcluded} repeated payment editions excluded
              </p>
              {r.issues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
              {r.amountsINR && (
                <p>
                  Recorded gross: {r.amountsINR.gross_amount ?? 'Unavailable'} INR · deductions:{' '}
                  {r.amountsINR.deduction_amount ?? 'Unavailable'} INR · net:{' '}
                  {r.amountsINR.net_amount ?? 'Unavailable'} INR
                </p>
              )}
              <p>
                Source status: {r.sourceStatus ?? 'Unavailable'} · flow:{' '}
                {r.sourceFlowType ?? 'Unclassified'}
              </p>
              {r.sourceDates && (
                <p>
                  Initiation: {r.sourceDates.initiation_date.iso ?? 'Unavailable'} · treasury:{' '}
                  {r.sourceDates.treasury_date.iso ?? 'Unavailable'} · cheque:{' '}
                  {r.sourceDates.cheque_date.iso ?? 'Unavailable'}
                  <br />
                  Recorded recipient credit/return date:{' '}
                  {r.sourceDates.recipient_credit_return_date.iso ?? 'Unavailable'} · cutoff:{' '}
                  {r.sourceDates.reporting_cutoff.iso ?? 'Unavailable'}
                </p>
              )}
              {r.allocations.map((a) => (
                <p key={a.allocationId}>
                  Project {a.projectId}: {a.amountINR} INR · {a.amountBasis} basis · unreviewed
                  allocation
                </p>
              ))}
              {!r.allocations.length && <p>No usable project allocation in this staged record.</p>}
              {Object.entries(r.allocationCoverage).map(([basis, c]) => (
                <p key={basis}>
                  {basis} shares: {c.allocatedAmountINR} INR against{' '}
                  {c.recordedAmountINR ?? 'unknown'} INR ·{' '}
                  {c.coversRecordedAmount ? 'Full recorded amount allocated' : 'Partial allocation'}
                </p>
              ))}
              <p>
                Recipient role, source authenticity, geography, settlement and reuse require
                evidence review. Nothing is approved or included in public spending.
              </p>
            </details>
          ))}
          <p>
            Page {data.page} of {data.pages} · {data.matchedPayments} matching payment identities
          </p>
          <button
            disabled={loading || data.page <= 1}
            onClick={() => void load(data.page - 1, loadedQuery)}
          >
            Previous exports
          </button>{' '}
          <button
            disabled={loading || data.page >= data.pages}
            onClick={() => void load(data.page + 1, loadedQuery)}
          >
            Next exports
          </button>
        </>
      )}
    </section>
  );
}
