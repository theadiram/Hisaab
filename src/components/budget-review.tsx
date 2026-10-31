'use client';
import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/money';
import Decimal from 'decimal.js';
type Record = {
  identity: string;
  demandNumber: number;
  department: string;
  financialYear: string;
  measure: string;
  totalCrore: string | null;
  revenueCrore: string | null;
  capitalCrore: string | null;
  locator: string;
  pdfPage: number;
  notationNote?: string;
  sourceDocument: { id: string; url: string; hash: string; permissionReviewed: boolean };
};
const measures: { [key: string]: string } = {
  actual: 'Reported actuals',
  budget_estimate: 'Budget estimate',
  revised_estimate: 'Revised estimate',
};
function rupees(value: string | null) {
  return value === null
    ? 'Not specified'
    : formatMoney(new Decimal(value).times(10000000).toFixed(2));
}
export function BudgetReview() {
  const [records, setRecords] = useState<Record[]>([]),
    [total, setTotal] = useState(0),
    [offset, setOffset] = useState(0),
    [draft, setDraft] = useState(''),
    [query, setQuery] = useState(''),
    [message, setMessage] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setMessage('');
    void fetch(
      '/api/v1/admin/budget?' + new URLSearchParams({ offset: String(offset), q: query }),
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            r.status === 401
              ? 'Sign in with your authenticator to open private financial records.'
              : 'Budget records could not load. Please retry.',
          );
        const data = await r.json();
        setRecords(data.records);
        setTotal(data.totalDemands);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setRecords([]);
          setMessage(e.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [offset, query]);
  const demands = Array.from(new Set(records.map((r) => r.demandNumber))).sort((a, b) => a - b);
  return (
    <main className="review-page budget-review">
      <a href="/admin">← Work evidence reviews</a>
      <div className="eyebrow">PRIVATE FINANCIAL CONTEXT</div>
      <h1>Before the work, the budget.</h1>
      <p>
        Compare planned spending with reported actuals for Union ministries and departments. Each
        net total was checked against the official PDF. These department-wide figures include
        spending beyond development projects.
      </p>
      <div className="info-note">
        Private assessment · Republication permission and financial review pending. These figures
        are excluded from work and payment totals. Reported actuals do not prove a contractor was
        paid or an asset completed.
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setQuery(draft.trim());
        }}
      >
        <label className="field">
          Find a ministry or department
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={200}
            placeholder="Try Railways, Health, Education or Sanitation"
          />
        </label>
        <button className="primary" disabled={loading}>
          Search financial context
        </button>
      </form>
      <p role="status">
        {loading
          ? 'Loading official context…'
          : message || `${total} demand statements · ${demands.length} shown`}
      </p>
      {message && <a href="/admin">Open administrator sign-in</a>}
      {demands.map((n) => {
        const entries = records
          .filter((r) => r.demandNumber === n)
          .sort(
            (a, b) =>
              a.financialYear.localeCompare(b.financialYear) || a.measure.localeCompare(b.measure),
          );
        const first = entries[0];
        return (
          <article className="budget-card" key={n}>
            <div className="eyebrow">DEMAND {n} · UNION GOVERNMENT</div>
            <h2>{first.department}</h2>
            <div className="budget-periods">
              {entries.map((r) => (
                <section key={r.identity}>
                  <small>{measures[r.measure]}</small>
                  <span>{r.financialYear}</span>
                  <strong>{rupees(r.totalCrore)}</strong>
                  <details>
                    <summary>Revenue and capital</summary>
                    <p>
                      Revenue: {rupees(r.revenueCrore)}
                      <br />
                      Capital: {rupees(r.capitalCrore)}
                    </p>
                    <small>Original total: {r.totalCrore ?? 'not specified'} crore</small>
                  </details>
                </section>
              ))}
            </div>
            <details>
              <summary>Original evidence and scope</summary>
              <p>
                Net of receipts and recoveries. Budget estimates, revised estimates and actuals
                describe different stages and periods; do not add these columns together.
              </p>
              {first.notationNote && <p>{first.notationNote}</p>}
              <p>{first.locator}</p>
              <a
                href={first.sourceDocument.url + '#page=' + first.pdfPage}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open authoritative PDF · page {first.pdfPage}
              </a>
              <small className="document-checksum">SHA-256: {first.sourceDocument.hash}</small>
              <p>
                {first.sourceDocument.permissionReviewed
                  ? 'Source permission review recorded; financial publication review still required.'
                  : 'Source republication permission is pending.'}
              </p>
            </details>
          </article>
        );
      })}
      {!loading && !message && total === 0 && (
        <p>No matching financial context has been imported.</p>
      )}
      <div className="budget-pagination">
        <button
          className="primary secondary"
          disabled={loading || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          Previous
        </button>
        <button
          className="primary"
          disabled={loading || offset + 20 >= total}
          onClick={() => setOffset(offset + 20)}
        >
          Next departments
        </button>
      </div>
    </main>
  );
}
