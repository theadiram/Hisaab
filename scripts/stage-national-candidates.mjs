import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.hosted');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const progress = JSON.parse(await readFile('data/nationwide-ingestion.json', 'utf8'));
await mkdir('.hisaab', { recursive: true });
let checkpoint = {};
try {
  checkpoint = JSON.parse(await readFile('.hisaab/national-staging.json', 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
for (const state of progress.statePartitions) {
  if (state.status !== 'original_preserved') continue;
  const hash = state.sha256,
    manifest = JSON.parse(await readFile(`data/acquisition/documents/${hash}.json`, 'utf8')),
    extraction = JSON.parse(await readFile(`data/acquisition/candidates/${hash}.json`, 'utf8'));
  const original = await readFile(manifest.original);
  if (createHash('sha256').update(original).digest('hex') !== hash)
    throw new Error('Original checksum mismatch');
  const candidates = extraction.candidates,
    parserHash = createHash('sha256').update(JSON.stringify(candidates)).digest('hex');
  const prior = checkpoint[hash];
  if (prior && prior.parserHash !== parserHash)
    throw new Error('Parser output changed; explicit review required');
  let offset = prior?.offset ?? 0,
    inserted = prior?.inserted ?? 0;
  while (offset < candidates.length) {
    const batch = candidates.slice(offset, offset + 500);
    const result = await db.rpc('stage_ingestion', {
      p_source: {
        id: manifest.sourceId,
        name: manifest.sourceName,
        official_url: manifest.contextUrl,
        family: manifest.sourceFamily,
      },
      p_document: {
        original_url: manifest.url,
        sha256: hash,
        storage_path: `${manifest.sourceId}/${hash}`,
        content_type: manifest.contentType,
        manifest,
        parser_version: extraction.parserVersion,
      },
      p_candidates: batch,
    });
    if (result.error)
      throw new Error(`Private staging stopped for ${state.state}: ${result.error.message}`);
    offset += batch.length;
    inserted += result.data;
    checkpoint[hash] = { offset, inserted, parserHash };
    await writeFile('.hisaab/national-staging.json', JSON.stringify(checkpoint), { mode: 0o600 });
    state.hostedCandidatesProcessed = offset;
    state.hostedCandidatesInserted = inserted;
    progress.hostedCandidatesProcessed = progress.statePartitions.reduce(
      (n, s) => n + (s.hostedCandidatesProcessed ?? 0),
      0,
    );
    await writeFile('data/nationwide-ingestion.json', JSON.stringify(progress, null, 2) + '\n');
  }
  state.hostedCandidatesProcessed = offset;
  state.hostedCandidatesInserted = inserted;
  progress.hostedCandidatesProcessed = progress.statePartitions.reduce(
    (n, s) => n + (s.hostedCandidatesProcessed ?? 0),
    0,
  );
  await writeFile('data/nationwide-ingestion.json', JSON.stringify(progress, null, 2) + '\n');
  console.log(
    JSON.stringify({
      state: state.state,
      candidatesProcessed: offset,
      candidatesCreatedAcrossRuns: inserted,
      publication: 'private_pending_review',
    }),
  );
}
