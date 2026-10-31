'use client';
import { useState } from 'react';
import { formatMoney } from '@/lib/money';
type Payment = {
  id: string;
  implementingUnit: string;
  billNumber: string;
  billDate: string;
  paymentReference: string;
  chequeAmount: string;
  bankReportedTransactionDate: string;
  amountBasis: string;
};
type Report = {
  total: number;
  page: number;
  pageSize: number;
  summary: { sourceUrl: string; documentHash: string };
  records: Payment[];
};
export function BankEvidenceReview() {
  const [report, setReport] = useState<Report | null>(null),
    [query, setQuery] = useState(''),
    [activeQuery, setActiveQuery] = useState(''),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  async function load(page = 1, search = query) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        '/api/v1/admin/bank-evidence?' + new URLSearchParams({ page: String(page), q: search }),
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setReport(body);
      setActiveQuery(search);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="road-evidence-review">
      <h3>Collected payment records</h3>
      <p>
        Inspect source-reported bank-accepted records from Odisha Rural Works Organisation. These
        department records have no verified project allocation and are excluded from map dots and
        spending totals.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label htmlFor="payment-search">Bill reference or implementing unit</label>
        <input
          id="payment-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={100}
        />
        <button className="secondary" disabled={loading}>
          {loading ? 'Loading payments…' : 'Inspect payment records'}
        </button>
      </form>
      {error && (
        <p role="status">
          {error} <a href="/admin">Open owner sign-in</a>
        </p>
      )}
      {report && (
        <>
          <p>
            {report.total.toLocaleString('en-IN')} matching records · Page {report.page}
          </p>
          <a href={report.summary.sourceUrl} target="_blank" rel="noopener noreferrer">
            Open official PFMS report
          </a>
          <small className="asset-hash">Original SHA-256: {report.summary.documentHash}</small>
          {report.records.map((r) => (
            <details className="road-evidence-case" key={r.id}>
              <summary>
                {r.billNumber} · {formatMoney(r.chequeAmount)}
              </summary>
              <p>{r.implementingUnit}</p>
              <dl>
                <dt>Bill date</dt>
                <dd>{r.billDate}</dd>
                <dt>Payment reference</dt>
                <dd>{r.paymentReference}</dd>
                <dt>Source cheque amount</dt>
                <dd>{formatMoney(r.chequeAmount)}</dd>
                <dt>Source-reported bank transaction date</dt>
                <dd>{r.bankReportedTransactionDate}</dd>
                <dt>Project / payee</dt>
                <dd>Not available · allocation evidence needed</dd>
              </dl>
              <p>
                {r.amountBasis}. Bank acceptance is source-reported, not independently confirmed.
              </p>
            </details>
          ))}
          {report.total === 0 && <p>No matching records.</p>}
          <div className="spending-actions">
            <button
              className="secondary"
              disabled={loading || report.page === 1}
              onClick={() => void load(report.page - 1, activeQuery)}
            >
              Previous payments
            </button>
            <button
              className="secondary"
              disabled={loading || report.page * report.pageSize >= report.total}
              onClick={() => void load(report.page + 1, activeQuery)}
            >
              Next payments
            </button>
          </div>
        </>
      )}
    </section>
  );
}
