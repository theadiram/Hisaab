import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
process.loadEnvFile('.env.hosted');
assert.equal(new URL(process.env.SUPABASE_URL).hostname, 'twkglheyewnuljdsywpp.supabase.co');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const reads = await client
  .from('published_work_receipts')
  .select('work_id', { count: 'exact' })
  .limit(1);
assert.equal(reads.error, null, 'Hosted public catalogue read must succeed');
const summary = await client.rpc('catalogue_summary');
assert.equal(summary.error, null);
assert.equal(summary.data.works, reads.count);
const map = await client.rpc('catalogue_map', {
  p_west: -180,
  p_south: -90,
  p_east: 180,
  p_north: 90,
});
assert.equal(map.error, null);
assert.ok(Array.isArray(map.data.features));
const clusters = await client.rpc('catalogue_map_clusters', {
  p_west: 68,
  p_south: 6,
  p_east: 98,
  p_north: 38,
});
assert.equal(clusters.error, null);
assert.ok(Array.isArray(clusters.data.features));
assert.equal(clusters.data.truncated, false);
const members = await client.rpc('catalogue_map_members', {
  p_west: 68,
  p_south: 6,
  p_east: 98,
  p_north: 38,
});
assert.equal(members.error, null);
assert.ok(Array.isArray(members.data.works));
for (const name of ['admin_candidates', 'admin_publications', 'admin_corrections'])
  assert.ok((await client.rpc(name)).error, `Anonymous ${name} must be denied`);
assert.ok(
  (await client.rpc('admin_candidates_page', { p_offset: 0, p_limit: 25, p_query: '' })).error,
  'Anonymous paged review must be denied',
);
assert.ok(
  (await client.rpc('admin_budget_context', { p_offset: 0, p_query: '' })).error,
  'Anonymous budget review must be denied',
);
assert.ok(
  (
    await client.rpc('stage_budget_context', {
      p_pdf_hash: 'a'.repeat(64),
      p_workbook_hash: 'b'.repeat(64),
      p_records: [],
    })
  ).error,
  'Anonymous budget intake must be denied',
);
assert.ok(
  (await client.rpc('admin_candidate', { p_id: 'unpublished' })).error,
  'Anonymous individual review must be denied',
);
assert.ok(
  (
    await client.rpc('import_lgd_registry', {
      p_hash: 'a'.repeat(64),
      p_date: '2026-10-06',
      p_areas: [],
    })
  ).error,
  'Anonymous registry writes must be denied',
);
assert.ok(
  (await client.rpc('list_case_attachments', { p_hash: 'a'.repeat(64) })).error,
  'Anonymous PDF access must be denied',
);
assert.ok(
  (await client.rpc('expired_case_files')).error,
  'Anonymous retention administration must be denied',
);
assert.ok(
  (await client.rpc('read_private_case', { p_hash: 'a'.repeat(64) })).error,
  'Anonymous case reads must be denied',
);
assert.ok(
  (await client.schema('private').from('private_cases').select('token_hash')).error,
  'Private schema must remain unexposed',
);
const buckets = await client.storage.listBuckets();
assert.equal((buckets.data ?? []).length, 0, 'Private buckets must not be listed publicly');
console.log(
  JSON.stringify({
    hostedRead: 'passed',
    publishedWorks: reads.count,
    districtsExpected: summary.data.districtsExpected,
    anonymousPrivateAccess: 'denied',
    storage: 'private',
  }),
);
