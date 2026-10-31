import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.hosted');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const registry = JSON.parse(await readFile('data/acquisition/districts.json', 'utf8'));
const areas = [...registry.states, ...registry.areas];
const params = { p_hash: registry.sourceHash, p_date: '2026-10-06', p_areas: areas };
const repeated = await db.rpc('import_lgd_registry', params);
assert.equal(repeated.error, null);
assert.equal(repeated.data, 784);
const changed = areas.map((a, i) =>
  i === areas.length - 1 ? { ...a, name: a.name + ' altered' } : a,
);
assert.ok(
  (await db.rpc('import_lgd_registry', { ...params, p_areas: changed })).error,
  'Changed identity must be rejected',
);
assert.ok(
  (await db.rpc('import_lgd_registry', { ...params, p_areas: areas.slice(0, -1) })).error,
  'Incomplete same-original registry must be rejected',
);
assert.ok(
  (await db.rpc('import_lgd_registry', { ...params, p_hash: 'a'.repeat(64) })).error,
  'Missing original must be rejected',
);
const summary = await db.rpc('catalogue_summary');
assert.equal(summary.error, null);
assert.equal(summary.data.districtsExpected, 784);
assert.equal(summary.data.districtsCovered, 0);
const members = await db
  .from('lgd_registry_members')
  .select('area_id', { count: 'exact' })
  .eq('source_hash', registry.sourceHash);
assert.equal(members.error, null);
assert.equal(members.count, 820);
console.log(
  JSON.stringify({
    registryIdempotence: 'passed',
    changedIdentity: 'rejected',
    incompleteRegistry: 'rejected',
    missingOriginal: 'rejected',
    statesAndDistricts: members.count,
    publishedDistrictCoverage: 0,
  }),
);
