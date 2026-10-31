'use client';
import { useState, useEffect } from 'react';
import type { DevelopmentOverview } from '@/lib/development';
import type { Exploration } from '@/lib/exploration';
export function useDevelopmentRecords(
  { year, measure, purpose, exploring }: Exploration,
  refresh: number,
) {
  const [data, setData] = useState<DevelopmentOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selection = new URLSearchParams({
    year: year,
    measure: measure,
    purpose: purpose,
  }).toString();
  useEffect(() => {
    if (!exploring) return;
    const c = new AbortController();
    setBusy(true);
    setData(null);
    setError('');
    void fetch('/api/v1/development?' + selection, { signal: c.signal })
      .then(async (r) => {
        const value = await r.json();
        if (!r.ok) throw new Error(value.error);
        if (!c.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [selection, exploring, refresh]);
  return { data, error, busy };
}
