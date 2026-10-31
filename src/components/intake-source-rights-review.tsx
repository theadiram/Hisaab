'use client';
import { useState } from 'react';
import type { IntakePackage } from '@/lib/intake-contract';

type Document = {
  id: string;
  sourceId: string;
  hash: string;
  url: string;
  licenseBasis: string | null;
  sourceApproved: boolean;
  permissionReviewed: boolean;
};
export function IntakeSourceRightsReview({ source }: { source: IntakePackage['sources'][number] }) {
  const [document, setDocument] = useState<Document | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function inspect() {
    const params = new URLSearchParams({ sourceId: source.id, hash: source.hash, url: source.url });
    const response = await fetch('/api/v1/admin/source-permission?' + params);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setDocument(data.document);
    return data.document as Document;
  }
  return (
    <details className="receipt-document">
      <summary>{source.name} · source-rights review</summary>
      <p>
        <a href={source.url} target="_blank" rel="noopener noreferrer">
          Open original source ↗
        </a>
      </p>
      <p style={{ overflowWrap: 'anywhere' }}>SHA-256: {source.hash}</p>
      <p>
        <strong>Collector’s proposed basis, not an approval:</strong> {source.reuseBasis}
      </p>
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMessage('');
          void inspect()
            .catch((e) => {
              setDocument(null);
              setMessage((e as Error).message);
            })
            .finally(() => setBusy(false));
        }}
      >
        Inspect this exact registered original
      </button>
      {document && (
        <>
          <p>
            {document.permissionReviewed && document.sourceApproved
              ? 'A rights decision is recorded for this exact document.'
              : 'Source rights are still awaiting explicit owner review.'}
          </p>
          <p>Recorded basis: {document.licenseBasis ?? 'Not reviewed'}</p>
          <form
            key={document.id}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setBusy(true);
              setMessage('');
              void (async () => {
                const response = await fetch('/api/v1/admin/source-permission', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    documentId: document.id,
                    basis: form.get('basis'),
                    evidence: form.get('evidence'),
                    confirmed: form.get('confirmed') === 'on',
                  }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                await inspect();
                setMessage(
                  'Document-specific rights decision saved. Project evidence and publication still need separate review.',
                );
              })()
                .catch((e) => setMessage((e as Error).message))
                .finally(() => setBusy(false));
            }}
          >
            <label className="field">
              Verified licence or written permission
              <textarea
                name="basis"
                minLength={30}
                maxLength={2000}
                required
                defaultValue={document.licenseBasis ?? ''}
              />
            </label>
            <label className="field">
              Policy or permission evidence reference
              <textarea name="evidence" minLength={20} maxLength={2000} required />
            </label>
            <label className="consent">
              <input type="checkbox" name="confirmed" required />I checked this exact original’s
              applicable reuse conditions, attribution and any third-party rights.
            </label>
            <button className="secondary" disabled={busy}>
              Record this document’s rights decision
            </button>
          </form>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
