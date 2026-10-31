import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
const context = JSON.parse(await readFile('data/acquisition/union-budget-context.json', 'utf8'));
const progress = JSON.parse(await readFile('data/union-budget-acquisition.json', 'utf8'));
for (const [name, hash] of Object.entries(context.documents)) {
  const result = spawnSync(
    process.execPath,
    ['scripts/stage-source.mjs', hash, '--original-only'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error(`Original preservation failed for ${name}: ${result.stderr.slice(0, 300)}`);
  if (!JSON.parse(result.stdout.trim()).originalChecksumVerified)
    throw new Error('Stored original checksum mismatch');
  console.log(JSON.stringify({ document: name, originalChecksumVerified: true }));
}
process.loadEnvFile('.env.hosted');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const { data, error } = await client.rpc('stage_budget_context', {
  p_pdf_hash: context.documents['detail.pdf'],
  p_workbook_hash: context.documents['detail.xlsx'],
  p_records: context.records,
});
if (error) throw new Error('Private financial context staging rejected: ' + error.message);
progress.hostedOriginalsVerified = true;
progress.hostedContextRows = context.records.length;
await writeFile('data/union-budget-acquisition.json', JSON.stringify(progress, null, 2) + '\n');
console.log(
  JSON.stringify({
    inserted: data,
    contextRows: context.records.length,
    publication: 'private_pending_permission_and_review',
  }),
);
