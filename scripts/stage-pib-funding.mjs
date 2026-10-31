import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { fundingRecordSchema } from '../src/lib/funding.ts';
process.loadEnvFile('.env.hosted');
const packet = JSON.parse(await readFile('data/acquisition/funding-pib-review.json', 'utf8'));
const ids = new Set(packet.recordIds);
const facts = JSON.parse(await readFile('data/acquisition/funding-records.json', 'utf8'))
  .records.filter((r) => ids.has(r.id))
  .map((r) => fundingRecordSchema.parse(r));
if (facts.length !== ids.size) throw new Error('Prepared facts are incomplete');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
for (const m of [...packet.originals, packet.policy]) {
  const r = spawnSync(process.execPath, ['scripts/stage-source.mjs', m.sha256, '--original-only'], {
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error('Private original staging failed');
}
let inserted = 0;
for (let i = 0; i < facts.length; i += 100) {
  const { data, error } = await client.rpc('stage_funding', { p_records: facts.slice(i, i + 100) });
  if (error) throw new Error(error.message);
  inserted += data;
}
console.log(
  JSON.stringify({
    inserted,
    privateFacts: facts.length,
    reviewable: packet.reviewableIds.length,
    publication: 'private_intake_does_not_change_publication',
  }),
);
