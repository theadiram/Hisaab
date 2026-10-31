'use client';
import { BookOpen, MapPin, ChevronRight } from 'lucide-react';
import type { Work } from '@/lib/model';

export function ProjectList({
  works,
  error,
  onSelect,
}: {
  works: Work[];
  error: string;
  onSelect: (w: Work) => void;
}) {
  return (
    <div className="atlas-project-list">
      {error && <p role="status">{error}</p>}
      {works.map((w) => (
        <button key={w.id} onClick={() => onSelect(w)}>
          <MapPin size={16} />
          <span>
            <strong>{w.title}</strong>
            <small>
              {w.district} · {w.financialYear}
            </small>
          </span>
          <ChevronRight size={14} />
        </button>
      ))}
      {!works.length && !error && (
        <div className="atlas-project-empty">
          <BookOpen size={22} />
          <p>
            No reviewed projects match this selection. Historical locations remain available on the
            map.
          </p>
        </div>
      )}
    </div>
  );
}
