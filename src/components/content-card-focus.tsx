'use client';
import { useEffect } from 'react';
import type { CardFocus, ContentPresentation } from '@/lib/content-mode';

/** Scroll only the receipt, never the page or the map stage. */
export function ContentCardFocus({
  focus,
  record,
  active,
  presentation,
}: {
  focus: CardFocus;
  record: string | null;
  active: boolean;
  presentation: ContentPresentation | null;
}) {
  useEffect(() => {
    if (!active || !record) return;
    const timer = setTimeout(() => {
      const card = document.querySelector<HTMLElement>('[data-asset-card]');
      if (!card) return;
      const section =
        focus === 'overview'
          ? null
          : (card.querySelector<HTMLElement>(`[data-card-section="${focus}"]`) ??
            card.querySelector<HTMLElement>('[data-card-section="evidence"]'));
      if (section instanceof HTMLDetailsElement) section.open = true;
      const top = section
        ? section.getBoundingClientRect().top -
          card.getBoundingClientRect().top +
          card.scrollTop -
          75
        : 0;
      card.scrollTo({
        top: Math.max(0, top),
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    }, 160);
    return () => clearTimeout(timer);
  }, [focus, record, active, presentation]);
  return null;
}
