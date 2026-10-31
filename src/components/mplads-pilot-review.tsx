'use client';
import { sourceRupees } from '@/lib/source-money';
import { useState } from 'react';
import type { PilotCard } from '@/lib/mplads-pilot';
const money = (value: string) => sourceRupees(value || null);
export function MpladsPilotReview() {
  const [cards, setCards] = useState<PilotCard[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  async function open() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/v1/admin/mplads-pilot', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setCards(body.cards);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Draft receipts unavailable');
    } finally {
      setLoading(false);
    }
  }
  return (
    <section aria-label="MPLADS pilot receipts">
      <h4>MPLADS pilot receipts · Owner review</h4>
      <p>
        Five Odisha projects with official expenditure rows and supporting documents. Draft
        evidence; no verified map coordinates or bank settlement yet.
      </p>
      <button className="secondary" onClick={open} disabled={loading}>
        {loading ? 'Opening receipts…' : 'Open five draft receipts'}
      </button>
      {error && (
        <p role="alert">
          {error} <a href="/admin">Owner sign-in</a>
        </p>
      )}
      {cards.map((c) => (
        <details className="road-evidence-case" key={c.id}>
          <summary>{c.title}</summary>
          <p>{c.workIds.join(' · ')} · Unpublished</p>
          <h5>Sanction</h5>
          {c.sanctions.map((s, i) => (
            <p key={i}>
              {money(s.amount)} · {s.date}
            </p>
          ))}
          <h5>Source-reported expenditure</h5>
          <p>
            Rows below are labelled “Payment Success” by the portal. Transaction IDs, recipient
            roles and gross/net basis remain unconfirmed. These amounts are not added to a verified
            payment total.
          </p>
          {c.payments.map((p, i) => (
            <div key={i}>
              <p>
                <strong>{money(p.amount)}</strong> · {p.date}
                <br />
                {p.recipient} · {p.status}
                <br />
                Implementing agency: {p.agency}
              </p>
            </div>
          ))}
          <h5>Supporting evidence</h5>
          {c.facts.map((f, i) => (
            <div key={i}>
              <p>
                <strong>
                  {f.kind === 'final-bill' ? 'First and final bill' : 'Completion certificate'}
                </strong>{' '}
                {f.reference}
              </p>
              {f.gross && (
                <p>
                  Gross capped: {money(f.gross)} · Deductions: {money(f.deductions)} · Net payable:{' '}
                  {money(f.net)}
                  <br />
                  Bill authorization does not establish bank credit.
                </p>
              )}
              {f.kind === 'completion-certificate' && (
                <p>
                  Physical completion on certificate:{' '}
                  {f.completionDate || 'Exact date unreadable; not inferred'}
                </p>
              )}
              {f.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          ))}
          <p>
            Portal completed date: {c.portalCompletion.join(', ') || 'Not available'}. This is kept
            separate from physical completion.
          </p>
          <p>
            Contract / work order: not verified. Individual payment reference: missing. Project
            coordinates: not verified.
          </p>
          <h5>Preserved official documents</h5>
          {c.documents.map((d) => (
            <p key={d.id}>
              <a
                href={`/api/v1/admin/mplads-pilot?document=${d.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {d.label}
              </a>{' '}
              · Checksum verified when opened
            </p>
          ))}
          <p>
            Next: confirm official location, payment references, deduction definitions and recipient
            roles, then submit explicit evidence decisions through owner review.
          </p>
        </details>
      ))}
    </section>
  );
}
