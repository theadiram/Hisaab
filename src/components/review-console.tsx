'use client';
import { EvidenceDecisions } from './evidence-decisions';
import { RoadEvidenceReview } from './road-evidence-review';
import { BankEvidenceReview } from './bank-evidence-review';
import { useState } from 'react';
import { CorrectionReview } from './correction-review';
import { CandidateTools } from './candidate-tools';
import { PublicationReview } from './publication-review';
import type { Work } from '@/lib/model';
import { formatMoney } from '@/lib/money';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
export function ReviewConsole({ works, total }: { works: Work[]; total: number }) {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(works),
    [count, setCount] = useState(total),
    [query, setQuery] = useState('');
  async function refresh() {
    const r = await fetch('/api/v1/admin/review?q=' + encodeURIComponent(query));
    if (!r.ok)
      throw new Error(
        r.status === 401
          ? 'Administrator session expired. Sign in again.'
          : 'The review queue is temporarily unavailable. Please retry.',
      );
    const data = await r.json();
    setPending(data.candidates);
    setCount(data.total);
    setMessage('');
  }
  return (
    <main className="review-page">
      <a href="/">
        <ArrowLeft size={16} />
        Return to map
      </a>
      <div className="eyebrow">PRIVATE ADMINISTRATION</div>
      <h1>Review the evidence.</h1>
      <a href="/admin/complaints">Citizen handoff review →</a>
      <a href="/admin/intake">Import and review agent packages →</a>
      <br />
      <a href="/admin/road-preview">Review checked road preview cards →</a>
      <br />
      <a href="/admin/funding">Review the Funding Atlas →</a>
      <br />
      <a href="/admin/finance">Review national budget context →</a>
      <p>
        Source originals, work matching, amounts, geography and redaction must be checked before
        publication. Publication requires a verified source permission basis and approved district
        identity.
      </p>
      <div className="info-note">
        <ShieldCheck size={16} /> MFA administrator review console · {pending.length} of {count}{' '}
        pending candidates shown
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void refresh().catch((e) => setMessage(e.message));
        }}
      >
        <label className="field">
          Find a candidate by road, state or district
          <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={200} />
        </label>
        <button className="primary">Search review queue</button>
      </form>
      {pending.map((w) => (
        <article className="review-work" key={w.id}>
          <h2>{w.title}</h2>
          <p>
            {w.district}, {w.state} · {w.officialIds.join(', ')}
          </p>
          {w.stages.map((s) => (
            <details key={s.id}>
              <summary>
                {s.label} · {s.state} · {formatMoney(s.amount)}
              </summary>
              {s.receipts.map((r) => (
                <div key={r.id}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    Original source
                  </a>
                  <p>{r.locator}</p>
                  <pre>{r.rawText}</pre>
                  <small>SHA-256: {r.documentHash}</small>
                </div>
              ))}
            </details>
          ))}
          <CandidateTools work={w} onSaved={refresh} />
          <EvidenceDecisions work={w} onSaved={refresh} />
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const r = await fetch('/api/v1/admin/review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: w.id,
                  reason: form.get('reason'),
                  confirmed: form.get('confirmed') === 'on',
                }),
              });
              const data = await r.json();
              setMessage(r.ok ? 'Reviewed publication saved to the hosted catalogue.' : data.error);
              if (r.ok) await refresh();
            }}
          >
            <label className="field">
              Review decision and source reconciliation
              <textarea name="reason" minLength={20} required rows={3} />
            </label>
            <label className="consent">
              <input type="checkbox" name="confirmed" required />I verified the original evidence,
              work identity, geography, financial semantics and public redaction.
            </label>
            <button className="primary">Publish reviewed evidence</button>
          </form>
        </article>
      ))}
      {!pending.length && (
        <div className="empty-state">
          <strong>No candidates awaiting review</strong>
          <p>
            Register an authorized original and run the extraction worker. A source homepage is not
            publishable work evidence.
          </p>
        </div>
      )}
      {pending.length < count && (
        <button
          className="primary"
          onClick={() =>
            void (async () => {
              try {
                const params = new URLSearchParams({ offset: String(pending.length), q: query });
                const r = await fetch('/api/v1/admin/review?' + params);
                if (!r.ok) throw new Error('Review queue unavailable');
                const data = await r.json();
                setPending((current) =>
                  Array.from(
                    new Map([...current, ...data.candidates].map((w: Work) => [w.id, w])).values(),
                  ),
                );
                setCount(data.total);
              } catch (e) {
                setMessage((e as Error).message);
              }
            })()
          }
        >
          Load more candidates
        </button>
      )}
      <PublicationReview />
      <RoadEvidenceReview />
      <BankEvidenceReview />
      <CorrectionReview />
      {message && <p role="status">{message}</p>}
    </main>
  );
}
