import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const report = JSON.parse(await readFile('data/geosadak-acquisition.json', 'utf8'));
const origin = 'http://127.0.0.1:3000';
async function get(route) {
  const r = await fetch(origin + route);
  assert.equal(r.status, 200);
  return r.json();
}
const all = await get('/api/v1/map/assets?bbox=68,5,98,38');
assert.equal(all.total, report.assetRows);
assert.ok(all.features.length <= 256);
assert.equal(
  all.features.reduce((n, f) => n + f.properties.count, 0),
  all.total,
);
assert.equal(all.spendingLinked, false);
const mobileGroups = await get('/api/v1/map/assets?bbox=68,5,98,38&cells=6');
assert.equal(mobileGroups.total, all.total);
assert.ok(mobileGroups.features.length <= 36);
assert.equal(
  mobileGroups.features.reduce((n, f) => n + f.properties.count, 0),
  all.total,
);
assert.equal((await fetch(origin + '/api/v1/map/assets?cells=100')).status, 400);
const schools = await get('/api/v1/map/assets?bbox=68,5,98,38&kind=education');
assert.equal(schools.total, report.byKind.education);
const health = await get('/api/v1/map/assets?bbox=68,5,98,38&kind=health');
assert.equal(health.total, report.byKind.health);
const first = await get('/api/v1/map/assets?bbox=68,5,98,38&kind=education&mode=members');
assert.equal(first.assets.length, 25);
assert.equal(first.total, schools.total);
const next = await get('/api/v1/map/assets?bbox=68,5,98,38&kind=education&mode=members&offset=25');
assert.ok(next.assets.every((a) => !first.assets.some((b) => a.id === b.id)));
const a = (await get('/api/v1/assets/' + encodeURIComponent(first.assets[0].id))).asset;
assert.equal(a.kind, 'education');
assert.equal(a.locationVerification, 'unreviewed_source_coordinate');
assert.equal(a.spendingLinked, false);
assert.deepEqual(a.photos, []);
assert.equal(a.buildingFootprint, null);
assert.equal(a.geometry.type, 'Point');
assert.deepEqual(a.geometry.coordinates, a.location);
assert.match(a.sourceHash, /^[a-f0-9]{64}$/);
assert.ok(a.sourceUrl.includes(report.mirrorCommit));
assert.ok(a.sourceRow > 0);
const tight = await get(
  '/api/v1/map/assets?bbox=' +
    [
      a.location[0] - 0.000001,
      a.location[1] - 0.000001,
      a.location[0] + 0.000001,
      a.location[1] + 0.000001,
    ].join(',') +
    '&kind=education',
);
assert.ok(tight.total >= 1);
assert.equal((await fetch(origin + '/api/v1/map/assets?bbox=98,5,68,38')).status, 400);
assert.equal((await fetch(origin + '/api/v1/map/assets?kind=anything')).status, 400);
assert.equal((await fetch(origin + '/api/v1/assets/../../etc')).status, 404);
const roads = await get('/api/v1/map/assets?bbox=68,5,98,38&kind=road&mode=members');
const road = (await get('/api/v1/assets/' + encodeURIComponent(roads.assets[0].id))).asset;
assert.ok(['LineString', 'MultiLineString'].includes(road.geometry.type));
assert.equal(road.spendingLinked, false);
const acquisition = await get('/api/v1/ingestion');
assert.equal(acquisition.assets.assetRows, all.total);
assert.equal(acquisition.assets.approvedPaymentLinks, 0);
assert.equal(acquisition.assets.proposedRoadLinks, 7161);
assert.equal(acquisition.assets.locationVerification, 'unreviewed_source_coordinate');
assert.ok(!JSON.stringify(acquisition).includes('candidateId'));
console.log(
  JSON.stringify({
    assetGeography: 'passed',
    records: all.total,
    education: schools.total,
    medical: health.total,
    fullGrouping: true,
    pagination: true,
    sourceLocators: true,
    spendingLinked: false,
    photos: 0,
    footprints: 0,
  }),
);
