import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { fundingRecordSchema } from '../src/lib/funding.ts';
process.loadEnvFile('.env.hosted');
const packet = JSON.parse(
  await readFile('data/acquisition/funding-programmes-review.json', 'utf8'),
);
const ids = new Set(packet.recordIds);
const facts = JSON.parse(await readFile('data/acquisition/funding-records.json', 'utf8'))
  .records.filter((r) => ids.has(r.id))
  .map((r) => fundingRecordSchema.parse(r));
if (facts.length !== ids.size) throw new Error('Prepared programme facts incomplete');
// Put the requested 2024–25 state view first if the capacity guard stops intake.
facts.sort(
  (a, b) => Number(b.financialYear === '2024-2025') - Number(a.financialYear === '2024-2025'),
);
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
for (const m of [...packet.originals, packet.policy, ...packet.supportingOriginals]) {
  const r = spawnSync(process.execPath, ['scripts/stage-source.mjs', m.sha256, '--original-only'], {
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error('Private original staging failed: ' + m.sha256);
}
let inserted = 0,
  processed = 0,
  capacityStopped = false;
for (let i = 0; i < facts.length; i += 50) {
  const capacity = await client.rpc('funding_ingestion_capacity');
  if (capacity.error) throw new Error(capacity.error.message);
  if (capacity.data >= 445644800) {
    capacityStopped = true;
    break;
  }
  const { data, error } = await client.rpc('stage_funding', { p_records: facts.slice(i, i + 50) });
  if (error) throw new Error(error.message);
  inserted += data;
  processed += Math.min(50, facts.length - i);
  await writeFile(
    'data/acquisition/funding-programme-stage-checkpoint.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        processed,
        insertedThisRun: inserted,
        recordIds: facts.slice(0, processed).map((r) => r.id),
        capacityStopped: false,
        publication: 'private_only',
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
}
const result = {
  inserted,
  processed,
  prepared: facts.length,
  capacityStopped,
  publication: 'private_intake_does_not_change_publication',
};
await writeFile(
  'data/acquisition/funding-programme-stage-result.json',
  JSON.stringify(result, null, 2) + '\n',
  { mode: 0o600 },
);
console.log(JSON.stringify(result));
