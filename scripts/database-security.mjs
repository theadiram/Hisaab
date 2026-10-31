import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
const env = Object.fromEntries(
  (await readFile('.env.local', 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
assert.equal(
  new URL(env.SUPABASE_URL).hostname,
  '127.0.0.1',
  'This test only targets local Supabase',
);
const anon = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
assert.ok(
  (await anon.rpc('read_private_case', { p_hash: 'a'.repeat(64) })).error,
  'Anonymous callers must not access case RPCs',
);
assert.ok(
  (
    await anon.rpc('store_private_case', {
      p_hash: 'a'.repeat(64),
      p_reference: 'unsafe',
      p_payload: {},
    })
  ).error,
  'Anonymous callers must not create private cases directly',
);
assert.ok(
  (await anon.schema('private').from('private_cases').select('*')).error,
  'Private schema must not be exposed',
);
assert.ok(
  (await anon.from('areas').insert({ id: 'test', code: 'test', kind: 'district', name: 'Test' }))
    .error,
  'Anonymous visitors must not edit government geography',
);
const buckets = await anon.storage.listBuckets();
assert.equal((buckets.data ?? []).length, 0, 'Private storage buckets must not be listed publicly');
console.log('PASS: private case RPCs, schema, geography writes and storage are protected.');
