import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.hosted');
const registry = JSON.parse(await readFile('data/acquisition/districts.json', 'utf8'));
const manifest = JSON.parse(
  await readFile(`data/acquisition/documents/${registry.sourceHash}.json`, 'utf8'),
);
assert.equal(
  createHash('sha256')
    .update(await readFile(manifest.original))
    .digest('hex'),
  registry.sourceHash,
);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const result = await db.rpc('import_lgd_registry', {
  p_hash: registry.sourceHash,
  p_date: '2026-10-06',
  p_areas: [...registry.states, ...registry.areas],
});
if (result.error) throw result.error;
assert.equal(result.data, 784);
const summary = await db.rpc('catalogue_summary');
if (summary.error) throw summary.error;
assert.equal(summary.data.districtsExpected, 784);
assert.equal(summary.data.districtsCovered, 0);
const status = JSON.parse(await readFile('data/geography-status.json', 'utf8'));
status.hostedRegistryImported = true;
await writeFile('data/geography-status.json', JSON.stringify(status, null, 2) + '\n');
console.log(
  JSON.stringify({
    districtsImported: result.data,
    statesImported: registry.states.length,
    publishedWorks: summary.data.works,
  }),
);
