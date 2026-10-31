/** Private immutable file preservation only. Does not stage SQL batches or approve evidence. */
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const root = fileURLToPath(new URL('../', import.meta.url));
const folder = path.join(root, 'data/acquisition/first-dots');
const manifest = JSON.parse(await readFile(path.join(folder, 'intake-manifest.json'), 'utf8'));
const checkpointPath = path.join(folder, 'hosted-originals-checkpoint.json');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const items = [];
for (const original of manifest.originals) {
  const bytes = await readFile(path.join(root, original.file));
  assert.equal(sha(bytes), original.hash, 'Original bytes changed');
  assert.ok(bytes.length <= 10 * 1024 * 1024, 'Original exceeds the existing pilot bound');
  assert.equal(original.storagePath, original.sourceId + '/' + original.hash);
  items.push({
    kind: 'source_original',
    path: original.storagePath,
    hash: original.hash,
    contentType: original.contentType,
    bytes,
  });
}
for (const batch of manifest.batches) {
  const bytes = await readFile(path.join(folder, 'intake', batch.file));
  assert.ok(bytes.length <= 2 * 1024 * 1024, 'Package exceeds existing intake bound');
  const hash = sha(bytes);
  items.push({
    kind: 'private_intake_package',
    path: `firstdot-intake-packages/${batch.batchId}-${hash}.json`,
    hash,
    contentType: 'application/json',
    bytes,
  });
}
if (!process.argv.includes('--upload')) {
  console.log(
    JSON.stringify({
      dryRun: true,
      originals: manifest.originals.length,
      privatePackages: manifest.batches.length,
      totalBytes: items.reduce((n, i) => n + i.bytes.length, 0),
      approvals: 0,
    }),
  );
  process.exit(0);
}
process.loadEnvFile(path.join(root, '.env.hosted'));
assert.equal(
  new URL(process.env.SUPABASE_URL).hostname,
  'twkglheyewnuljdsywpp.supabase.co',
  'Unexpected project destination',
);
assert.ok(
  process.env.SUPABASE_SECRET_KEY,
  'Existing server-side preservation connection is unavailable',
);
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
  global: {
    fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(60000) }),
  },
});
const bucket = await client.storage.getBucket('source-originals');
if (bucket.error) throw new Error('Private original bucket is unavailable');
assert.equal(bucket.data.public, false, 'Refusing to preserve private evidence in a public bucket');
const checkpoint = {
  projectId: 'twkglheyewnuljdsywpp',
  bucket: 'source-originals',
  private: true,
  startedAt: new Date().toISOString(),
  scope:
    'Original/package preservation only; no source-rights decision, SQL batch staging, evidence approval or publication.',
  records: [],
  failures: [],
  stagedProjects: 0,
  publishedProjects: 0,
};
try {
  const previous = await readFile(checkpointPath);
  await writeFile(checkpointPath + '.prior-' + sha(previous).slice(0, 16) + '.json', previous);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const save = async () => {
  await writeFile(checkpointPath + '.tmp', JSON.stringify(checkpoint, null, 2) + '\n');
  await rename(checkpointPath + '.tmp', checkpointPath);
};
await save();
for (const item of items) {
  try {
    const uploaded = await client.storage
      .from('source-originals')
      .upload(item.path, item.bytes, { contentType: item.contentType, upsert: false });
    if (
      uploaded.error &&
      !['409', 'Duplicate'].includes(String(uploaded.error.statusCode)) &&
      !/already exists|duplicate/i.test(uploaded.error.message ?? '')
    )
      throw new Error(
        `Immutable private upload failed (${uploaded.error.statusCode ?? 'unknown status'})`,
      );
    const downloaded = await client.storage.from('source-originals').download(item.path);
    if (downloaded.error || !downloaded.data) throw new Error('Private original read-back failed');
    assert.equal(
      sha(Buffer.from(await downloaded.data.arrayBuffer())),
      item.hash,
      'Remote preserved bytes do not match',
    );
    checkpoint.records.push({
      kind: item.kind,
      path: item.path,
      hash: item.hash,
      bytes: item.bytes.length,
      remoteChecksumVerified: true,
      checkedAt: new Date().toISOString(),
    });
    await save();
    if (checkpoint.records.length % 5 === 0)
      console.log(
        JSON.stringify({
          preservedAndReadBack: checkpoint.records.length,
          total: items.length,
          private: true,
          published: 0,
        }),
      );
  } catch (error) {
    checkpoint.failures.push({
      path: item.path,
      kind: item.kind,
      error: error instanceof Error ? error.message : 'Preservation failed',
      checkedAt: new Date().toISOString(),
    });
    await save();
    throw new Error(
      'Preservation stopped; retain the private checkpoint and retry only after resolving the recorded failure.',
    );
  }
}
checkpoint.completedAt = new Date().toISOString();
await save();
console.log(
  JSON.stringify({
    privateOriginals: checkpoint.records.filter((r) => r.kind === 'source_original').length,
    privatePackages: checkpoint.records.filter((r) => r.kind === 'private_intake_package').length,
    allRemoteChecksumsVerified: checkpoint.records.every((r) => r.remoteChecksumVerified),
    stagedProjects: 0,
    publishedProjects: 0,
  }),
);
