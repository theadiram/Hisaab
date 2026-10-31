import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.hosted');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
let total = 0;
const editions = [];
for (const file of (await readdir('data/acquisition/funding-interpretations')).sort()) {
  const data = JSON.parse(
    await readFile('data/acquisition/funding-interpretations/' + file, 'utf8'),
  );
  const progressPath = 'data/acquisition/funding-checkpoints/columns-' + data.edition + '.json';
  let next = 0;
  try {
    const saved = JSON.parse(await readFile(progressPath, 'utf8'));
    if (saved.sourceHash === data.sourceHash && saved.parserVersion === data.parserVersion)
      next = saved.next;
  } catch {}
  const capacity = await db.rpc('funding_ingestion_capacity');
  if (capacity.error || capacity.data > 425 * 1024 * 1024)
    throw new Error(
      'Private interpretation staging requires a working capacity check with free-plan headroom',
    );
  for (let i = next; i < data.records.length; i += 100) {
    const rows = data.records.slice(i, i + 100),
      result = await db.rpc('stage_funding_interpretations', { p_rows: rows });
    if (result.error) throw new Error('Private column staging paused: ' + result.error.message);
    await writeFile(
      progressPath,
      JSON.stringify({
        sourceHash: data.sourceHash,
        parserVersion: data.parserVersion,
        next: i + rows.length,
      }),
    );
  }
  total += data.records.length;
  editions.push({
    financialYear: data.edition,
    interpretedRows: data.records.length,
    quarantinedRows: data.quarantine.length,
  });
  console.log(JSON.stringify(editions.at(-1)));
}
const meta = JSON.parse(await readFile('data/funding-acquisition.json', 'utf8'));
meta.columnInterpretations = {
  privateRows: total,
  editions,
  publication: false,
  scope:
    'Source financial columns only. Programme classification and hierarchy reconciliation are still required.',
};
await writeFile('data/funding-acquisition.json', JSON.stringify(meta, null, 2) + '\n');
console.log(JSON.stringify({ privateInterpretations: total }));
