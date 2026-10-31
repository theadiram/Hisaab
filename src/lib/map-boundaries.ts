// These editions retain all source vertices. Share downloads between map layers
// and state navigation; failed requests can be retried on the next visit.
import { mapDeliveryBase } from './map-delivery';
export const boundaryUrls = {
  india: '/geography/india-display.geojson?v=5f9af3778019',
  states: '/geography/funding-states.geojson?v=09019a99ecaf',
} as const;

const downloads = new Map<string, Promise<GeoJSON.FeatureCollection>>();

export function loadMapBoundary(
  kind: keyof typeof boundaryUrls,
): Promise<GeoJSON.FeatureCollection> {
  const url = boundaryUrls[kind];
  const existing = downloads.get(url);
  if (existing) return existing;
  const base = mapDeliveryBase();
  const address = base
    ? `${base}/boundaries/${kind === 'india' ? 'india-display' : 'funding-states'}.geojson`
    : url;
  const request = async (address: string) => {
    const response = await fetch(address, { cache: 'force-cache' });
    if (!response.ok) throw new Error('Map boundary unavailable');
    const geometry = (await response.json()) as GeoJSON.FeatureCollection;
    if (
      geometry.type !== 'FeatureCollection' ||
      !Array.isArray(geometry.features) ||
      (kind === 'states' && geometry.features.length !== 36)
    ) {
      throw new Error('Map boundary edition is incomplete');
    }
    return geometry;
  };
  const loading = (base ? request(address).catch(() => request(url)) : request(url)).catch(
    (error) => {
      downloads.delete(url);
      throw error;
    },
  );
  downloads.set(url, loading);
  return loading;
}
