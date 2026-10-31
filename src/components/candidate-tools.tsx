'use client';
import { useState } from 'react';
import type { Work } from '@/lib/model';
type Candidate = Work & {
  sourceDocument?: { id: string; hash: string; url: string; licenseBasis: string | null };
  review?: { blockers?: string[] };
};
export function CandidateTools({
  work,
  onSaved,
}: {
  work: Candidate;
  onSaved: () => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  async function submit(url: string, value: unknown) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    await onSaved();
    setMessage('Review saved in the audit trail.');
  }
  return (
    <>
      {work.review?.blockers?.length && (
        <div className="info-note">
          Original extraction checks: {work.review.blockers.join(' · ')}
        </div>
      )}
      <details>
        <summary>Reconcile identity and geography</summary>
        <p>
          Choose the district identifier from the approved official registry. Source facts and
          amounts remain attached to their originals.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            try {
              await submit('/api/v1/admin/reconcile', {
                work: {
                  ...work,
                  title: form.get('title'),
                  areaId: form.get('areaId'),
                  summary: form.get('summary'),
                },
                reason: form.get('reason'),
                confirmed: form.get('confirmed') === 'on',
              });
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <label className="field">
            Work title
            <input name="title" defaultValue={work.title} maxLength={1000} required />
          </label>
          <label className="field">
            Official district identifier
            <input
              name="areaId"
              defaultValue={work.areaId}
              placeholder="district:LGD-code"
              required
            />
          </label>
          <label className="field">
            Evidence summary
            <textarea name="summary" defaultValue={work.summary} rows={3} />
          </label>
          <label className="field">
            Reconciliation reason
            <textarea name="reason" minLength={20} required rows={3} />
          </label>
          <label className="consent">
            <input name="confirmed" type="checkbox" required />I checked the original work identity
            and official district evidence.
          </label>
          <button className="secondary">Save reconciliation</button>
        </form>
      </details>
      {work.sourceDocument && (
        <details>
          <summary>Review source reproduction permission</summary>
          <p>
            Permission must cover this specific document and any third-party copyright. Record the
            precise licence or written authorization and its evidence reference.
          </p>
          <p>
            Current basis: {work.sourceDocument.licenseBasis ?? 'Unverified — publication blocked'}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              try {
                await submit('/api/v1/admin/source-permission', {
                  documentId: work.sourceDocument!.id,
                  basis: form.get('basis'),
                  evidence: form.get('evidence'),
                  confirmed: form.get('confirmed') === 'on',
                });
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <label className="field">
              Verified licence or permission basis
              <textarea name="basis" minLength={30} maxLength={2000} required rows={3} />
            </label>
            <label className="field">
              Permission evidence reference
              <textarea name="evidence" minLength={20} maxLength={2000} required rows={2} />
            </label>
            <label className="consent">
              <input name="confirmed" type="checkbox" required />I verified the applicable licence
              or written permission, including third-party rights.
            </label>
            <button className="secondary">Record permission review</button>
          </form>
        </details>
      )}
      {message && <p role="status">{message}</p>}
    </>
  );
}
