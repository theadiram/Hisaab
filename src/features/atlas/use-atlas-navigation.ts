'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  initialExploration,
  readExploration,
  explorationUrl,
  type Exploration,
} from '@/lib/exploration';
import { fundingStates } from '@/lib/funding';
import { getShowcaseWork } from '@/lib/showcase-work';
import type { Work } from '@/lib/model';
import type { AssetDetail } from '@/lib/asset-geography';
type Handlers = {
  setWork: (work: Work | null) => void;
  setAsset: (asset: AssetDetail | null) => void;
  setPanel: (panel: 'track') => void;
};
export function useAtlasNavigation({ setWork, setAsset, setPanel }: Handlers) {
  const [view, setView] = useState<Exploration>(initialExploration);
  const go = useCallback(
    (next: Exploration, replace = false) => {
      setView(next);
      const url = new URL(explorationUrl(next, new URL(location.href)), location.origin);
      if (getShowcaseWork(next.work)) url.searchParams.set('demo', 'complete');
      else url.searchParams.delete('demo');
      history[replace ? 'replaceState' : 'pushState'](
        null,
        '',
        url.pathname + url.search + url.hash,
      );
    },
    [setWork, setAsset, setPanel],
  );
  useEffect(() => {
    const restore = () => {
      const url = new URL(location.href),
        next = readExploration(url);
      const fixture = getShowcaseWork(next.work);
      if (url.searchParams.get('demo') === 'complete' && fixture) {
        setWork(fixture);
        setAsset(null);
        setView({
          ...next,
          screen: 'asset',
          state: fundingStates.find((s) => s.name === fixture.state)?.code ?? null,
          asset: fixture.assetId ?? null,
          exploring: true,
        });
      } else {
        setView(next);
        if (!fixture) setWork(null);
      }
      if (location.hash.startsWith('#track=')) setPanel('track');
    };
    restore();
    addEventListener('popstate', restore);
    addEventListener('hashchange', restore);
    return () => {
      removeEventListener('popstate', restore);
      removeEventListener('hashchange', restore);
    };
  }, [setWork, setAsset, setPanel]);
  return { view, go };
}
