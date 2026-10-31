'use client';
import { useEffect, useState } from 'react';
import type { Work } from '@/lib/model';
type Publication = { work: Work; version: number; withdrawnAt: string | null };
export function PublicationReview() {
  const [items, setItems] = useState<Publication[]>([]),
    [message, setMessage] = useState('');
  async function load() {
    const r = await fetch('/api/v1/admin/publications');
    if (!r.ok) throw new Error('Publication review unavailable. Sign in again.');
    setItems((await r.json()).publications);
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  return (
    <section>
      <h2>Publication history</h2>
      <p>
        Withdrawals hide the current receipt while preserving its review history. A replacement
        requires a new reconciliation and review.
      </p>
      {items.map((p) => (
        <article className="review-work" key={p.work.id}>
          <h3>{p.work.title}</h3>
          <p>
            Version {p.version} · {p.withdrawnAt ? 'Withdrawn' : 'Active'}
          </p>
          {!p.withdrawnAt && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                try {
                  const r = await fetch('/api/v1/admin/review', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'withdraw',
                      id: p.work.id,
                      reason: form.get('reason'),
                      confirmed: form.get('confirmed') === 'on',
                    }),
                  });
                  const data = await r.json();
                  if (!r.ok) throw new Error(data.error);
                  await load();
                  setMessage('Publication withdrawn. Its earlier versions remain hidden.');
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              <label className="field">
                Withdrawal reason
                <textarea name="reason" minLength={20} required rows={3} />
              </label>
              <label className="consent">
                <input type="checkbox" name="confirmed" required />
                Withdraw this receipt and record my reason.
              </label>
              <button className="secondary">Withdraw receipt</button>
            </form>
          )}
        </article>
      ))}
      {!items.length && <p>No reviewed publications.</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
