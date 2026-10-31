import type { Work } from './model';
export type MapPoint = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    cluster: boolean;
    count: number;
    id?: string;
    title?: string;
    purpose?: string;
    bounds?: [number, number, number, number];
  };
};
export type MapPoints = {
  type: 'FeatureCollection';
  features: MapPoint[];
  total: number;
  truncated: boolean;
};
export function clusterWorks(works: Work[], bounds: number[]): MapPoints {
  const [west, south, east, north] = bounds;
  const cells = new Map<string, Work[]>();
  for (const w of works) {
    if (!w.location || !['source_point', 'address'].includes(w.locationPrecision)) continue;
    const [lng, lat] = w.location;
    if (lng < west || lng > east || lat < south || lat > north) continue;
    const key = `${Math.min(15, Math.floor(((lng - west) / (east - west)) * 16))}:${Math.min(15, Math.floor(((lat - south) / (north - south)) * 16))}`;
    const cell = cells.get(key);
    if (cell) cell.push(w);
    else cells.set(key, [w]);
  }
  const features: MapPoint[] = Array.from(cells.values()).map((rows) => {
    const coordinates = rows.map((w) => w.location!);
    const lngs = coordinates.map((c) => c[0]),
      lats = coordinates.map((c) => c[1]);
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          lngs.reduce((a, b) => a + b, 0) / rows.length,
          lats.reduce((a, b) => a + b, 0) / rows.length,
        ],
      },
      properties:
        rows.length === 1
          ? {
              cluster: false,
              count: 1,
              id: rows[0].id,
              title: rows[0].title,
              purpose: rows[0].purpose,
            }
          : {
              cluster: true,
              count: rows.length,
              bounds: [
                lngs.reduce((a, b) => Math.min(a, b), Infinity),
                lats.reduce((a, b) => Math.min(a, b), Infinity),
                lngs.reduce((a, b) => Math.max(a, b), -Infinity),
                lats.reduce((a, b) => Math.max(a, b), -Infinity),
              ],
            },
    };
  });
  return {
    type: 'FeatureCollection',
    features,
    total: Array.from(cells.values()).reduce((n, rows) => n + rows.length, 0),
    truncated: false,
  };
}
