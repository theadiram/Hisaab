'use client';
import { useEffect, useState } from 'react';
import { FundingBudgetDraft, type BudgetColumnInterpretation } from './funding-budget-draft';
import { fundingPurposes } from '@/lib/funding';
import { formatMoney } from '@/lib/money';
type Row = {
  id: string;
  rawText: string;
  page: number;
  line: number;
  demandNumber: number | null;
  classification: string;
  sourceUrl: string;
  purpose?: string;
  reviewReason?: string;
  interpretation?: BudgetColumnInterpretation;
};
export function FundingInventory({ year, query }: { year: string; query: string }) {
  const [rows, setRows] = useState<Row[]>([]),
    [counts, setCounts] = useState<{ [key: string]: number }>({}),
    [total, setTotal] = useState(0),
    [offset, setOffset] = useState(0),
    [message, setMessage] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => setOffset(0), [year, query]);
  useEffect(() => {
    const c = new AbortController();
    setRows([]);
    setMessage('Loading original budget rows…');
    void fetch(
      '/api/v1/admin/funding/inventory?' +
        new URLSearchParams({ year, q: query, offset: String(offset) }),
      { signal: c.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setRows(d.records);
        setTotal(d.total);
        setCounts(d.counts ?? {});
        setMessage('');
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setMessage(e.message);
      });
    return () => c.abort();
  }, [year, query, offset, revision]);
  return (
    <section>
      <h2>Account for every original row.</h2>
      <p>
        These rows preserve hierarchy, net/gross totals, recoveries and original fiscal columns. Row
        classification alone does not publish an amount. Programme identity, units, fiscal-column
        meanings and parent/child reconciliation must be established before staging a funding fact.
      </p>
      <div className="info-note">
        {Object.entries(counts).map(([k, n]) => (
          <span key={k}>
            {k.replaceAll('_', ' ')}: {n.toLocaleString('en-IN')} ·{' '}
          </span>
        ))}
      </div>
      <p role="status">{message || `${total.toLocaleString('en-IN')} rows matching this search`}</p>
      {rows.map((r) => (
        <InventoryRow key={r.id} row={r} onSaved={() => setRevision((n) => n + 1)} />
      ))}
      <div className="detail-actions">
        <button disabled={!offset} onClick={() => setOffset((n) => Math.max(0, n - 40))}>
          Previous rows
        </button>
        <button disabled={offset + 40 >= total} onClick={() => setOffset((n) => n + 40)}>
          Next rows
        </button>
      </div>
    </section>
  );
}
function InventoryRow({ row: r, onSaved }: { row: Row; onSaved: () => void }) {
  const [classification, setClassification] = useState(r.classification),
    [purpose, setPurpose] = useState(r.purpose ?? 'other'),
    [reason, setReason] = useState(r.reviewReason ?? ''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const response = await fetch('/api/v1/admin/funding/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, classification, purpose, reason, confirmed: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onSaved();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="budget-card">
      <summary>
        Demand {r.demandNumber ?? 'unresolved'} · PDF page {r.page}, line {r.line} ·{' '}
        {r.classification.replaceAll('_', ' ')}
      </summary>
      <p>{r.rawText}</p>
      {r.interpretation ? (
        <>
          <div className="budget-periods">
            {r.interpretation.columns.map((c, i) => (
              <section key={i}>
                <small>{c.measure.replaceAll('_', ' ')}</small>
                <span>{c.financialYear}</span>
                <strong>{formatMoney(c.totalRupees)}</strong>
                {Object.entries(c.components).map(([k, v]) => (
                  <p key={k}>
                    {k.replaceAll('_', ' ')}: {v ?? 'unknown'} crore
                  </p>
                ))}
              </section>
            ))}
          </div>
          <p>
            {r.interpretation.missingNotation} {r.interpretation.reconciliation}
          </p>
        </>
      ) : (
        <p>Financial columns are unresolved; no amount is inferred.</p>
      )}
      <a href={r.sourceUrl + '#page=' + r.page} target="_blank" rel="noopener noreferrer">
        Open original page ↗
      </a>
      <label className="field">
        Classification
        <select value={classification} onChange={(e) => setClassification(e.target.value)}>
          <option value="awaiting_review">Awaiting review</option>
          <option value="included">Included development</option>
          <option value="excluded">Excluded / context / parent subtotal</option>
          <option value="mixed_unresolved">Mixed or unresolved</option>
        </select>
      </label>
      <label className="field">
        Purpose
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {Object.entries(fundingPurposes).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Classification evidence and hierarchy notes
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={30}
          maxLength={3000}
        />
      </label>
      <button disabled={busy || reason.trim().length < 30} onClick={() => void save()}>
        Save private classification
      </button>
      {message && <p role="status">{message}</p>}
      {r.interpretation && (
        <FundingBudgetDraft
          rowId={r.id}
          classification={r.classification}
          interpretation={r.interpretation}
        />
      )}
    </details>
  );
}
