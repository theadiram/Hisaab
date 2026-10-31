import { fundingStates } from '@/lib/funding';
import { clusterWorks } from '@/lib/map-clusters';
import { readCatalogue } from '@/lib/catalogue';
import { publicDb } from '@/lib/public-db';
export async function GET(request: Request) {
  const bounds = (new URL(request.url).searchParams.get('bbox') || '-180,-90,180,90')
    .split(',')
    .map(Number);
  if (
    bounds.length !== 4 ||
    bounds.some((n) => !Number.isFinite(n)) ||
    bounds[0] >= bounds[2] ||
    bounds[1] >= bounds[3] ||
    bounds[0] < -180 ||
    bounds[2] > 180 ||
    bounds[1] < -90 ||
    bounds[3] > 90
  )
    return Response.json({ error: 'Invalid bounds' }, { status: 400 });
  const params = new URL(request.url).searchParams;
  const q = (params.get('q') || '').slice(0, 200),
    purpose = params.get('purpose'),
    year = params.get('year');
  const stateCode = params.get('state'),
    state = stateCode ? fundingStates.find((s) => s.code === stateCode)?.name : null;
  if (stateCode && !state) return Response.json({ error: 'Invalid state' }, { status: 400 });
  if (params.get('mode') === 'points') {
    const offset = Number(params.get('offset') || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 10000000)
      return Response.json({ error: 'Invalid page' }, { status: 400 });
    if (process.env.HISAAB_DATA_MODE === 'supabase') {
      const result = await publicDb().rpc('catalogue_map_points', {
        p_west: bounds[0],
        p_south: bounds[1],
        p_east: bounds[2],
        p_north: bounds[3],
        p_query: q,
        p_purpose: purpose,
        p_year: year,
        p_state: state,
        p_offset: offset,
      });
      return result.error
        ? Response.json({ error: 'Project points unavailable' }, { status: 503 })
        : Response.json(result.data);
    }
    const matching = (await readCatalogue()).works
      .filter(
        (w) =>
          w.location &&
          ['source_point', 'address'].includes(w.locationPrecision) &&
          (!state || w.state === state) &&
          (!purpose || w.purpose === purpose) &&
          (!year || w.financialYear === year) &&
          [w.title, w.state, w.district, ...w.officialIds]
            .join(' ')
            .toLowerCase()
            .includes(q.toLowerCase()) &&
          w.location[0] >= bounds[0] &&
          w.location[0] <= bounds[2] &&
          w.location[1] >= bounds[1] &&
          w.location[1] <= bounds[3],
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    return Response.json({
      type: 'FeatureCollection',
      features: matching
        .slice(offset, offset + 5000)
        .map((w) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: w.location },
          properties: { id: w.id, title: w.title, purpose: w.purpose },
        })),
      total: matching.length,
      nextOffset: matching.length > offset + 5000 ? offset + 5000 : null,
    });
  }
  const members = params.get('mode') === 'members',
    offset = Math.trunc(Math.max(0, Math.min(10000000, Number(params.get('offset')) || 0)));
  const metadata = {
    coverage: 'Approved imported points only',
    grouping: 'Nearby works grouped; group centres are not work locations',
  };
  if (process.env.HISAAB_DATA_MODE === 'supabase') {
    const result = await publicDb().rpc(
      members ? 'catalogue_map_members' : 'catalogue_map_clusters',
      {
        p_west: bounds[0],
        p_south: bounds[1],
        p_east: bounds[2],
        p_north: bounds[3],
        p_query: q,
        p_purpose: purpose,
        p_year: year,
        ...(members ? { p_offset: offset } : {}),
      },
    );
    if (result.error) return Response.json({ error: 'Published map unavailable' }, { status: 503 });
    return Response.json({ ...result.data, ...metadata });
  }
  const { works } = await readCatalogue();
  const matching = works.filter(
    (w) =>
      (!purpose || w.purpose === purpose) &&
      (!year || w.financialYear === year) &&
      [w.title, w.state, w.district, ...w.officialIds]
        .join(' ')
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  if (members) {
    const located = matching
      .filter(
        (w) =>
          w.location &&
          ['source_point', 'address'].includes(w.locationPrecision) &&
          w.location[0] >= bounds[0] &&
          w.location[0] <= bounds[2] &&
          w.location[1] >= bounds[1] &&
          w.location[1] <= bounds[3],
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    return Response.json({
      total: located.length,
      works: located
        .slice(offset, offset + 25)
        .map((w) => ({ id: w.id, title: w.title, purpose: w.purpose })),
    });
  }
  return Response.json({ ...clusterWorks(matching, bounds), ...metadata });
}
