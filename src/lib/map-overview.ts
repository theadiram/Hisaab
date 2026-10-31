import delivery from '../../data/map-overview.json';
import { mapDeliveryBase } from './map-delivery';

export const detailZoom = delivery.minDetailZoom;
export const overviewTemplate = delivery.urlTemplate;
export type OverviewFeature = GeoJSON.Feature<
  GeoJSON.Point,
  {
    count: number;
    agriculture: number;
    education: number;
    health: number;
    public: number;
    road: number;
    bounds: number[];
  }
>;
export type Overview = GeoJSON.FeatureCollection<GeoJSON.Point, OverviewFeature['properties']>;
const downloads = new Map<number, Promise<Overview>>();

export function overviewZoom(zoom: number) {
  return Math.max(0, Math.min(delivery.maxOverviewZoom, Math.floor(zoom)));
}
export function overviewForKind(overview: Overview, kind: string | null): Overview {
  return {
    ...overview,
    features: overview.features.flatMap((feature) => {
      const count = kind
        ? Number(feature.properties[kind as keyof OverviewFeature['properties']] ?? 0)
        : feature.properties.count;
      return count > 0 ? [{ ...feature, properties: { ...feature.properties, count } }] : [];
    }),
  };
}
export function loadMapOverview(zoom: number): Promise<Overview> {
  const level = overviewZoom(zoom),
    existing = downloads.get(level);
  if (existing) return existing;
  const original = overviewTemplate.replace('{z}', String(level)),
    base = mapDeliveryBase();
  const address = base ? `${base}/overview/z${level}.geojson` : original;
  const request = async (url: string) => {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error('Map summary unavailable');
    const data = (await response.json()) as Overview;
    if (
      data.type !== 'FeatureCollection' ||
      !Array.isArray(data.features) ||
      data.features.reduce((n, feature) => n + feature.properties.count, 0) !== delivery.count
    )
      throw new Error('Incomplete map summary');
    return data;
  };
  const loading = (
    base ? request(address).catch(() => request(original)) : request(original)
  ).catch((error) => {
    downloads.delete(level);
    throw error;
  });
  downloads.set(level, loading);
  return loading;
}
