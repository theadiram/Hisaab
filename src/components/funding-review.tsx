'use client';
import { FundingInventory } from './funding-inventory';
import { useEffect, useRef, useState } from 'react';
import { fundingYears, type FundingRecord } from '@/lib/funding';
import { formatMoney, formatExactMoney } from '@/lib/money';
type Record = FundingRecord & {
  documentId: string;
  permissionReviewed: boolean;
  published: boolean;
  lastDecision?: { classification: FundingRecord['classification'] };
};
export function FundingReview() {
  const [inventory, setInventory] = useState(false);
  const [year, setYear] = useState('2026-2027'),
    [query, setQuery] = useState(''),
    [offset, setOffset] = useState(0),
    [records, setRecords] = useState<Record[]>([]),
    [total, setTotal] = useState(0),
    [message, setMessage] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const loadedScope = useRef('');
  useEffect(() => {
    if (inventory) return;
    const scope = JSON.stringify([year, query, offset]);
    const c = new AbortController();
    setLoading(true);
    if (loadedScope.current !== scope) setRecords([]);
    loadedScope.current = scope;
    setMessage('');
    void fetch(
      '/api/v1/admin/funding?' + new URLSearchParams({ year, q: query, offset: String(offset) }),
      { signal: c.signal },
    )
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setRecords(data.records);
        setTotal(data.total);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setMessage(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [year, query, offset, revision, inventory]);
  return (
    <main className="review-page budget-review">
      <a href="/admin">← Owner console</a>
      <p className="eyebrow">PRIVATE FUNDING REVIEW</p>
      <h1>Review each funding fact.</h1>
      <p>
        Classification, Union share, reporting period, jurisdiction and source rights are separate
        decisions. Publishing here creates a funding record, never a project payment.
      </p>
      <div className="info-note">
        Original budget context remains immutable. Saving a new decision removes any previous public
        version until you explicitly publish again. Withdraw overlapping editions before replacing
        them.
      </div>
      <div className="detail-actions">
        <button aria-pressed={!inventory} onClick={() => setInventory(false)}>
          Funding facts
        </button>
        <button aria-pressed={inventory} onClick={() => setInventory(true)}>
          Budget row inventory
        </button>
      </div>
      <div className="funding-review-filters">
        <label>
          Financial year
          <select
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setOffset(0);
            }}
          >
            {fundingYears.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          Find programme, state or ministry
          <input
            value={query}
            maxLength={200}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
            }}
          />
        </label>
      </div>
      {inventory ? (
        <FundingInventory year={year} query={query} />
      ) : (
        <>
          <p role="status">
            {loading
              ? 'Loading private evidence…'
              : message ||
                `${total.toLocaleString('en-IN')} records · review pending unless explicitly approved`}
          </p>
          {message && <a href="/admin">Sign in with your authenticator</a>}
          {records.map((r) => (
            <FundingDecision key={r.id} record={r} onSaved={() => setRevision((v) => v + 1)} />
          ))}
          <div className="budget-pagination">
            <button
              disabled={loading || offset === 0}
              onClick={() => setOffset((n) => Math.max(0, n - 20))}
            >
              Previous records
            </button>
            <button
              disabled={loading || offset + 20 >= total}
              onClick={() => setOffset((n) => n + 20)}
            >
              Next records
            </button>
          </div>
        </>
      )}
    </main>
  );
}
function FundingDecision({ record: r, onSaved }: { record: Record; onSaved: () => void }) {
  const [classification, setClassification] = useState(
      r.lastDecision?.classification ?? r.classification,
    ),
    [checks, setChecks] = useState<{ [key: string]: boolean }>({}),
    [reason, setReason] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [basis, setBasis] = useState(''),
    [evidence, setEvidence] = useState('');
  async function save(action: 'save' | 'publish' | 'withdraw') {
    setBusy(true);
    try {
      const response = await fetch('/api/v1/admin/funding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: r.id,
          reason,
          decision: {
            classification,
            action,
            confirmed: true,
            sourceChecked: !!checks.sourceChecked,
            unitsChecked: !!checks.unitsChecked,
            jurisdictionChecked: !!checks.jurisdictionChecked,
            scopeChecked: !!checks.scopeChecked,
            editionsChecked: !!checks.editionsChecked,
          },
        }),
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
  async function withdrawSource() {
    setBusy(true);
    try {
      const response = await fetch('/api/v1/admin/funding/source-withdrawal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: r.documentId, reason, confirmed: true }),
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
  async function rights() {
    setBusy(true);
    try {
      const response = await fetch('/api/v1/admin/source-permission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: r.documentId, basis, evidence, confirmed: true }),
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
    <article className="budget-card" data-funding-id={r.id}>
      <div className="eyebrow">
        {r.jurisdictionLabel} · {r.financialYear} · {r.published ? 'PUBLISHED' : 'PRIVATE'}
      </div>
      <h2>{r.programme}</h2>
      <strong>{formatMoney(r.amountRupees)}</strong>
      <p>
        {r.measure.replaceAll('_', ' ')} · {r.estimate.replaceAll('_', ' ')} · {r.share} share ·{' '}
        {r.instrument}
      </p>
      <dl>
        <dt>Exact source amount (INR)</dt>
        <dd>{formatExactMoney(r.amountRupees)}</dd>
        <dt>Ministry / channel</dt>
        <dd>
          {r.ministry} · {r.channel.replaceAll('_', ' ')}
        </dd>
        <dt>Accounting basis</dt>
        <dd>{r.accountingBasis.replaceAll('_', ' ')}</dd>
        <dt>Period / cutoff</dt>
        <dd>
          {r.periodStart} to {r.periodEnd} · cutoff {r.cutoff}
        </dd>
        <dt>Edition / scope</dt>
        <dd>
          {r.edition} · {r.coverageKey} · {r.aggregation}
        </dd>
        <dt>Source locator</dt>
        <dd>{r.source.locator}</dd>
      </dl>
      <p>{r.notes}</p>
      {r.conflict && (
        <div className="info-note">
          Conflicting evidence: this fact cannot be published until a reconciled source edition is
          staged.
        </div>
      )}
      <a
        href={r.source.url + (r.source.page ? '#page=' + r.source.page : '')}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open original evidence ↗
      </a>
      <small className="document-checksum">SHA-256: {r.source.hash}</small>
      <details>
        <summary>Source rights: {r.permissionReviewed ? 'review recorded' : 'pending'}</summary>
        <p>
          Record a written authorization or precise applicable licence. Public accessibility alone
          is insufficient.
        </p>
        <label className="field">
          Permission basis
          <textarea value={basis} onChange={(e) => setBasis(e.target.value)} />
        </label>
        <label className="field">
          Permission evidence reference
          <input value={evidence} onChange={(e) => setEvidence(e.target.value)} />
        </label>
        <button
          disabled={busy || basis.trim().length < 30 || evidence.trim().length < 20}
          onClick={() => void rights()}
        >
          Record source permission
        </button>
        <p>
          To withdraw every funding fact based on this original, enter the documented reason below.
        </p>
        <button disabled={busy || reason.trim().length < 30} onClick={() => void withdrawSource()}>
          Withdraw this source’s funding facts
        </button>
      </details>
      <label className="field">
        Development classification
        <select
          value={classification}
          onChange={(e) => setClassification(e.target.value as FundingRecord['classification'])}
        >
          <option value="awaiting_review">Awaiting review</option>
          <option value="included">Included development</option>
          <option value="excluded">Excluded</option>
          <option value="mixed_unresolved">Mixed development / maintenance or unresolved</option>
        </select>
      </label>
      <fieldset>
        <legend>Evidence checks for this fact</legend>
        {Object.entries({
          sourceChecked: 'Original and table checked',
          unitsChecked: 'Exact units and amount checked',
          jurisdictionChecked: 'Official state attribution checked',
          scopeChecked: 'Union share, purpose and accounting scope checked',
          editionsChecked: 'Editions, cumulative periods and overlaps checked',
        }).map(([key, label]) => (
          <label className="funding-check" key={key}>
            <input
              type="checkbox"
              checked={!!checks[key]}
              onChange={(e) => setChecks((c) => ({ ...c, [key]: e.target.checked }))}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="field">
        Documented decision
        <textarea
          value={reason}
          minLength={30}
          maxLength={3000}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="detail-actions">
        <button disabled={busy || reason.trim().length < 30} onClick={() => void save('save')}>
          Save private classification
        </button>
        <button
          disabled={
            busy ||
            !r.permissionReviewed ||
            r.conflict ||
            r.share !== 'union' ||
            r.amountRupees === null ||
            r.aggregation !== 'leaf' ||
            r.instrument === 'unresolved' ||
            classification !== 'included' ||
            Object.values(checks).filter(Boolean).length !== 5 ||
            reason.trim().length < 30
          }
          onClick={() => void save('publish')}
        >
          Publish reviewed fact
        </button>
        {r.published && (
          <button
            disabled={busy || reason.trim().length < 30}
            onClick={() => void save('withdraw')}
          >
            Withdraw
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </article>
  );
}
