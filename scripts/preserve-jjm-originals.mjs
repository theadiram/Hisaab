import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const progress = JSON.parse(await readFile('data/jjm-acquisition.json', 'utf8'));
for (const report of progress.reports) {
  const result = spawnSync(
    process.execPath,
    ['scripts/stage-source.mjs', report.sha256, '--original-only'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`Original preservation failed for ${report.year}`);
  const proof = JSON.parse(result.stdout.trim());
  if (!proof.originalChecksumVerified) throw new Error('Original checksum verification failed');
  report.hostedOriginalVerified = true;
  console.log(
    JSON.stringify({
      year: report.year,
      rows: report.rows,
      hostedOriginalVerified: true,
      scope: progress.scope,
    }),
  );
}
progress.hostedOriginalsVerified = true;
await writeFile('data/jjm-acquisition.json', JSON.stringify(progress, null, 2) + '\n');
