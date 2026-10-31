'use client';
import { useState } from 'react';
import type { Work } from '@/lib/model';
export function CorrectionForm({ work }: { work: Work }) {
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <>
      <div className="eyebrow">HELP IMPROVE THE RECORD</div>
      <h2 id="dialog-title">Suggest a correction</h2>
      <p>{work.title}</p>
      {work.demo ? (
        <div className="info-note">
          This fictional work is a design preview. Corrections are available for published
          government records.
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const form = new FormData(e.currentTarget);
              const r = await fetch('/api/v1/corrections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  workId: work.id,
                  field: form.get('field'),
                  reason: form.get('reason'),
                  evidenceUrl: form.get('evidenceUrl') || undefined,
                  consent: form.get('consent') === 'on',
                }),
              });
              const data = await r.json();
              setMessage(
                r.ok
                  ? `Correction queued for evidence review. Reference: ${data.reference}`
                  : data.error,
              );
            } catch {
              setMessage('Correction could not be saved. Please try again.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Which part needs a correction?
            <select name="field">
              <option value="identity">Work identity</option>
              <option value="geography">Location</option>
              <option value="sanction">Sanction</option>
              <option value="award">Contract</option>
              <option value="payment">Payment</option>
              <option value="completion">Completion</option>
              <option value="authority">Authority</option>
            </select>
          </label>
          <label className="field">
            What should be checked?
            <textarea name="reason" minLength={20} maxLength={5000} required rows={4} />
          </label>
          <label className="field">
            Supporting official source link
            <input name="evidenceUrl" type="url" placeholder="https://…" />
          </label>
          <label className="consent">
            <input name="consent" type="checkbox" required />
            Send this privately to the evidence reviewers. Avoid personal identifiers.
          </label>
          <button className="primary" disabled={busy}>
            Submit for review
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </>
  );
}
