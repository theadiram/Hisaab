import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const progress = JSON.parse(await readFile('data/nationwide-ingestion.json', 'utf8'));
for (const state of progress.statePartitions) {
  if (state.status !== 'original_preserved') continue;
  const result = spawnSync(
    process.execPath,
    ['scripts/stage-source.mjs', state.sha256, '--original-only'],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
  if (result.status !== 0)
    throw new Error(`Original preservation failed for ${state.state}; no credentials logged`);
  console.log(
    JSON.stringify({
      state: state.state,
      sourceRows: state.sourceRows,
      originalChecksumVerified: true,
      publication: 'private_original_only',
    }),
  );
}
