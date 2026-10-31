'use client';
import { useEffect, useState } from 'react';
type Correction = {
  id: string;
  field: string;
  reason: string;
  evidenceUrl?: string;
  workId: string;
};
export function CorrectionReview() {
  const [items, setItems] = useState<Correction[]>([]),
    [message, setMessage] = useState('');
  async function load() {
    const r = await fetch('/api/v1/admin/corrections');
    if (!r.ok) throw new Error('Administrator session expired. Sign in again.');
    setItems((await r.json()).corrections);
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  return (
    <section>
      <h2>Citizen corrections</h2>
      <p>
        Accepting a correction opens reconciliation. A published receipt changes only after a
        separate evidence review.
      </p>
      {items.map((c) => (
        <article className="review-work" key={c.id}>
          <h3>{c.field}</h3>
          <p>{c.reason}</p>
          {c.evidenceUrl && (
            <a href={c.evidenceUrl} target="_blank" rel="noopener noreferrer">
              Supporting source
            </a>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              try {
                const r = await fetch('/api/v1/admin/corrections', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    id: c.id,
                    decision: form.get('decision'),
                    reason: form.get('reason'),
                  }),
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                await load();
                setMessage('Correction decision recorded in the audit trail.');
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <label className="field">
              Decision
              <select name="decision">
                <option value="accepted_for_reconciliation">
                  Accept for evidence reconciliation
                </option>
                <option value="rejected">Reject with reason</option>
              </select>
            </label>
            <label className="field">
              Review reason
              <textarea name="reason" minLength={20} required rows={3} />
            </label>
            <button className="primary">Record decision</button>
          </form>
        </article>
      ))}
      {!items.length && <p>No pending corrections.</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
