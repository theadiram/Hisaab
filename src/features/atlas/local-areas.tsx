'use client';
import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';

export function LocalAreas({ state, onQuery }: { state: string; onQuery: (q: string) => void }) {
  const [areas, setAreas] = useState<{ id: string; name: string; kind: string }[]>([]),
    [parent, setParent] = useState<string | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const c = new AbortController();
    setError('');
    void fetch('/api/v1/areas?' + new URLSearchParams(parent ? { parent } : { state }), {
      signal: c.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setAreas(data.areas);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => c.abort();
  }, [state, parent]);
  useEffect(() => setParent(null), [state]);
  return (
    <details>
      <summary>District and locality explorer</summary>
      {parent && (
        <button className="atlas-text-button" onClick={() => setParent(null)}>
          Return to districts
        </button>
      )}
      {error && <p role="status">{error}</p>}
      {!areas.length && !error && (
        <p className="atlas-caption">
          Further reviewed area records are unavailable. Search by an official project ID or place
          name.
        </p>
      )}
      {areas.map((a) => (
        <div className="atlas-locality-row" key={a.id}>
          <button onClick={() => onQuery(a.name)}>
            {a.name}
            <small>{a.kind}</small>
          </button>
          <button aria-label={'Explore subdivisions of ' + a.name} onClick={() => setParent(a.id)}>
            <ChevronRight size={15} />
          </button>
        </div>
      ))}
    </details>
  );
}
