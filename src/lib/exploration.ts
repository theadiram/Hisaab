import { fundingStates, fundingYears, fundingMeasures, fundingPurposes } from './funding';

export type Exploration = {
  screen: 'india' | 'state' | 'asset';
  state: string | null;
  asset: string | null;
  work: string | null;
  year: string;
  measure: (typeof fundingMeasures)[number];
  purpose: string;
  exploring: boolean;
};
export const initialExploration: Exploration = {
  screen: 'india',
  state: null,
  asset: null,
  work: null,
  year: '2026-2027',
  measure: 'allocated',
  purpose: 'all',
  exploring: false,
};
export function readExploration(url: URL): Exploration {
  const p = url.searchParams,
    parts = url.pathname.split('/').filter(Boolean),
    state = p.get('state') ?? (parts[0] === 'state' ? parts[1] : null),
    asset =
      p.get('asset') ??
      (parts[0] === 'asset' ? decodeURIComponent(parts.slice(1).join('/')) : null),
    work = p.get('work');
  const validState = fundingStates.some((s) => s.code === state) ? state : null;
  return {
    ...initialExploration,
    state: validState,
    asset,
    work,
    screen: asset || work ? 'asset' : validState ? 'state' : 'india',
    year: fundingYears.includes(p.get('year') ?? '') ? p.get('year')! : initialExploration.year,
    measure: fundingMeasures.includes(p.get('measure') as Exploration['measure'])
      ? (p.get('measure') as Exploration['measure'])
      : initialExploration.measure,
    purpose: Object.hasOwn(fundingPurposes, p.get('purpose') ?? '') ? p.get('purpose')! : 'all',
    exploring: !!(
      asset ||
      work ||
      validState ||
      p.get('view') === 'funding' ||
      p.get('explore') === '1'
    ),
  };
}
export function explorationUrl(state: Exploration, current: URL): string {
  const url = new URL(current);
  url.pathname =
    state.screen === 'state' && state.state
      ? '/state/' + state.state
      : state.screen === 'asset'
        ? '/asset/' + encodeURIComponent(state.asset ?? state.work ?? '')
        : '/';
  for (const key of [
    'state',
    'asset',
    'work',
    'view',
    'preview',
    'explore',
    'year',
    'measure',
    'purpose',
  ])
    url.searchParams.delete(key);
  if (state.screen === 'asset' && state.work) url.searchParams.set('work', state.work);
  if (state.screen === 'asset' && state.state) url.searchParams.set('state', state.state);
  if (state.exploring) url.searchParams.set('explore', '1');
  if (state.year !== initialExploration.year) url.searchParams.set('year', state.year);
  if (state.measure !== initialExploration.measure) url.searchParams.set('measure', state.measure);
  if (state.purpose !== 'all') url.searchParams.set('purpose', state.purpose);
  return url.pathname + url.search + url.hash;
}
