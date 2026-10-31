'use client';
import { useEffect, useState } from 'react';
type Attachment = { id: string; name: string; sha256: string; pages: number };
export function PrivateDocuments({ onUploaded }: { onUploaded: () => void }) {
  const [files, setFiles] = useState<Attachment[]>([]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch('/api/v1/reports/attachments');
    if (!r.ok) throw new Error('Private records could not be loaded.');
    setFiles((await r.json()).attachments);
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  return (
    <section aria-label="Private documents">
      <h3>Private records and acknowledgements</h3>
      <p>
        Up to ten PDFs, 10 MB and 100 pages each. Files remain encrypted. A supplied acknowledgement
        is not independently verified.
      </p>
      {files.map((file) => (
        <article className="tracking-case" key={file.id}>
          <a href={`/api/v1/reports/attachments/${file.id}`} download>
            {file.name}
          </a>
          <small>
            {file.pages} pages · SHA-256: {file.sha256}
          </small>
        </article>
      ))}
      <details>
        <summary>Attach a private PDF</summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            setBusy(true);
            setMessage('');
            try {
              const data = new FormData(form);
              data.set('acknowledgement', data.get('acknowledgement') === 'on' ? 'true' : 'false');
              const r = await fetch('/api/v1/reports/attachments', { method: 'POST', body: data });
              const result = await r.json();
              if (!r.ok) throw new Error(result.error);
              form.reset();
              await load();
              onUploaded();
              setMessage('PDF saved privately.');
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            PDF record
            <input name="file" type="file" accept="application/pdf" required />
          </label>
          <label className="consent">
            <input name="acknowledgement" type="checkbox" />
            This is an acknowledgement I received. Record it as evidence supplied by me.
          </label>
          <button className="primary" disabled={busy}>
            Save private PDF
          </button>
        </form>
      </details>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
