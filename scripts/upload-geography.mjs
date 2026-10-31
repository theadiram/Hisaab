import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Upload } from 'tus-js-client';
process.loadEnvFile('.env.hosted');
const root = 'data/acquisition/geography/hosted',
  manifestBytes = readFileSync(root + '/manifest.json'),
  m = JSON.parse(manifestBytes),
  digest = createHash('sha256').update(manifestBytes).digest('hex'),
  prefix = 'edition-' + digest,
  bucket = 'historical-geography';
const files = [
  ...m.files.map((f) => ({ file: f.name, ...f })),
  ...m.archives,
  { file: 'manifest.json', bytes: manifestBytes.length, sha256: digest },
];
const total = files.reduce((n, f) => n + f.bytes, 0);
if (total > 350 * 1024 * 1024 || files.some((f) => f.bytes > 50 * 1024 * 1024))
  throw new Error('Free storage publishing bound exceeded');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  }),
  b = await client.storage.getBucket(bucket);
if (b.error) {
  const made = await client.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: 50 * 1024 * 1024,
  });
  if (made.error) throw made.error;
} else if (!b.data.public)
  throw new Error('Geography bucket must be dedicated to licensed public geography');
async function upload(f) {
  const path = prefix + '/' + f.file,
    bytes = readFileSync(root + '/' + f.file);
  if (bytes.length !== f.bytes || createHash('sha256').update(bytes).digest('hex') !== f.sha256)
    throw new Error('Package checksum mismatch');
  const publicUrl = client.storage.from(bucket).getPublicUrl(path).data.publicUrl,
    head = await fetch(publicUrl, { method: 'HEAD' });
  if (head.ok && Number(head.headers.get('content-length')) === bytes.length) {
    console.log('Already preserved', f.file);
    return;
  }
  if (head.ok) throw new Error('Immutable object conflict');
  const r = await client.storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
  if (r.error) throw r.error;
  const u = new URL(process.env.SUPABASE_URL);
  u.hostname = u.hostname.replace('.supabase.co', '.storage.supabase.co');
  u.pathname = '/storage/v1/upload/resumable';
  await new Promise((resolve, reject) => {
    new Upload(bytes, {
      endpoint: u.toString(),
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 3000, 5000, 10000],
      uploadDataDuringCreation: true,
      storeFingerprintForResuming: false,
      headers: {
        apikey: process.env.SUPABASE_SECRET_KEY,
        authorization: 'Bearer ' + process.env.SUPABASE_SECRET_KEY,
      },
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: f.file.endsWith('.json') ? 'application/json' : 'application/octet-stream',
        cacheControl: '31536000',
      },
      onError: (error) => reject(new Error(error.message.slice(0, 500))),
      onSuccess: resolve,
    }).start();
  });
  console.log('Preserved', f.file, f.bytes);
}
// Immutable manifest is published last, after every referenced object succeeds.
const payload = files.slice(0, -1);
for (let i = 0; i < payload.length; i += 2) await Promise.all(payload.slice(i, i + 2).map(upload));
await upload(files.at(-1));
const url = client.storage.from(bucket).getPublicUrl(prefix + '/manifest.json').data.publicUrl;
let env = readFileSync('.env.hosted', 'utf8').replace(/^HISAAB_GEOGRAPHY_MANIFEST=.*\n?/m, '');
writeFileSync('.env.hosted', env.trimEnd() + '\nHISAAB_GEOGRAPHY_MANIFEST=' + url + '\n', {
  mode: 0o600,
});
writeFileSync(
  root + '/upload-status.json',
  JSON.stringify({
    url,
    count: m.count,
    bytes: total,
    manifestHash: digest,
    completedAt: new Date().toISOString(),
  }),
);
console.log({ count: m.count, bytes: total, complete: true });
