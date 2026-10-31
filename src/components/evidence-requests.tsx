'use client';
import { useState } from 'react';
export function EvidenceRequests() {
  const [requests, setRequests] = useState<{ name: string; text: string }[] | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/v1/admin/evidence-requests');
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setRequests(data.requests);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <section>
      <h4>Owner request dossier</h4>
      <p>
        Read the prepared RTI drafts, agency proposal and sent department request inside the app.
        Drafts have not been submitted.
      </p>
      {!requests && (
        <button className="secondary" disabled={loading} onClick={() => void load()}>
          {loading ? 'Loading requests…' : 'Open request dossier'}
        </button>
      )}
      {error && (
        <p role="status">
          {error} <a href="/admin">Owner sign-in</a>
        </p>
      )}
      {requests?.map((r) => (
        <details key={r.name}>
          <summary>{r.name.replaceAll('-', ' ').replace('.md', '')}</summary>
          <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.text}</div>
        </details>
      ))}
    </section>
  );
}
