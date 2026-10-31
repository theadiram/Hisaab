import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { removeExpiredCases } from './retention-worker.mjs';
process.loadEnvFile('.env.local');
assert.equal(
  new URL(process.env.SUPABASE_URL).hostname,
  '127.0.0.1',
  'Disposable local database required',
);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const sql = (value) =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_Hisaab',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: value, encoding: 'utf8' },
  ).trim();
assert.equal(
  sql('select count(*) from private.private_cases where expires_at<now();'),
  '0',
  'Existing expired local cases must not be included in a disposable test',
);
const hashes = [randomBytes(32).toString('hex'), randomBytes(32).toString('hex')],
  paths = [];
try {
  for (const hash of hashes) {
    const id = randomUUID(),
      path = hash + '/' + id + '.enc',
      bytes = Buffer.from('Disposable retention fixture');
    const stored = await db.rpc('store_private_case', {
      p_hash: hash,
      p_reference: 'TEST-' + id,
      p_payload: { test: true },
    });
    assert.equal(stored.error, null);
    const uploaded = await db.storage
      .from('case-documents')
      .upload(path, bytes, { contentType: 'application/octet-stream' });
    assert.equal(uploaded.error, null);
    paths.push(path);
    const attachment = await db.rpc('register_case_attachment', {
      p_id: id,
      p_hash: hash,
      p_path: path,
      p_sha: createHash('sha256').update(bytes).digest('hex'),
      p_metadata: { test: true },
      p_event: null,
    });
    assert.equal(attachment.error, null);
  }
  sql(
    `update private.private_cases set expires_at=now()-interval '1 day' where token_hash='${hashes[0]}';`,
  );
  assert.deepEqual(await removeExpiredCases(db, { enabled: true }), { enabled: true, deleted: 1 });
  assert.equal(
    sql(`select count(*) from private.private_cases where token_hash='${hashes[0]}';`),
    '0',
  );
  assert.equal(
    sql(`select count(*) from private.private_cases where token_hash='${hashes[1]}';`),
    '1',
  );
  assert.ok(
    (await db.storage.from('case-documents').download(paths[0])).error,
    'Expired file remains',
  );
  assert.equal(
    (await db.storage.from('case-documents').download(paths[1])).error,
    null,
    'Active file was deleted',
  );
  console.log('PASS: expired file and metadata removed; active case and file preserved');
} finally {
  if (paths.length) await db.storage.from('case-documents').remove(paths);
  sql(`delete from private.private_cases where token_hash in('${hashes[0]}','${hashes[1]}');`);
}
