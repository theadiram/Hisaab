'use client';
import { useState } from 'react';
import { validateIntake } from '@/lib/intake-contract';

/** Uses the same protected, bounded single-package API for every selected file. */
export function PreparedBatchIntake({ onStaged }: { onStaged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  return (
    <details>
      <summary>Stage several prepared packages</summary>
      <p>
        Choose only the validated intake JSON packages. Every package and preserved original is
        checked again by the owner API. This stages private evidence; it makes no evidence, rights
        or publication decisions.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const files = new FormData(event.currentTarget)
            .getAll('packages')
            .filter((f): f is File => f instanceof File && f.size > 0);
          if (!files.length || files.length > 100) {
            setMessage('Choose between one and 100 prepared package files.');
            return;
          }
          setBusy(true);
          setMessage('Checking selected packages.');
          void (async () => {
            // Validate the complete selection before making the first staging request.
            const prepared = [];
            for (const file of files) {
              if (file.size > 2 * 1024 * 1024)
                throw new Error(file.name + ': exceeds the 2 MB package limit');
              const parsed = validateIntake(JSON.parse(await file.text())).package;
              prepared.push({ name: file.name, package: parsed });
            }
            for (let index = 0; index < prepared.length; index++) {
              const item = prepared[index];
              setMessage(`Staging ${index + 1} of ${prepared.length}: ${item.name}`);
              const response = await fetch('/api/v1/admin/intake', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item.package),
              });
              const result = await response.json();
              if (!response.ok)
                throw new Error(
                  `${index} of ${prepared.length} completed. ${item.name}: ${result.error ?? 'Staging stopped'}`,
                );
            }
            await onStaged();
            setMessage(
              `Completed ${prepared.length} private package checks/staging requests. No facts or projects were published.`,
            );
          })()
            .catch(async (error) => {
              setMessage(error instanceof Error ? error.message : 'Private intake stopped.');
              try {
                await onStaged();
              } catch {
                /* Keep the original failure visible. */
              }
            })
            .finally(() => setBusy(false));
        }}
      >
        <label className="field">
          Prepared package files
          <input
            name="packages"
            type="file"
            accept="application/json,.json"
            multiple
            required
            disabled={busy}
          />
        </label>
        <button className="secondary" disabled={busy}>
          Validate and stage selected packages
        </button>
      </form>
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
    </details>
  );
}
