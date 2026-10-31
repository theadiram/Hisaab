import {
  S3Client,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

if (existsSync('.env.r2.local')) process.loadEnvFile('.env.r2.local');
const root = 'data/acquisition/geography/r2-map',
  manifest = JSON.parse(readFileSync(root + '/manifest.json', 'utf8'));
const allowed =
  /^(boundaries\/(india-display|funding-states)\.geojson|overview\/z[0-5]\.geojson|tiles\/(agriculture|education|health|road|public-[0-2])\/[6-9]\/\d+\/\d+\.pbf)$/;
for (const file of manifest.files) {
  if (!allowed.test(file.key)) throw new Error('Package contains an unexpected public object');
  const bytes = readFileSync(root + '/' + file.key);
  if (
    bytes.length !== file.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== file.sha256
  )
    throw new Error('Package checksum mismatch');
}
console.log(
  JSON.stringify({
    prefix: manifest.prefix,
    files: manifest.files.length,
    bytes: manifest.totalBytes,
    records: manifest.count,
    dryRun: !process.argv.includes('--upload'),
  }),
);
if (!process.argv.includes('--upload')) process.exit(0);
const account = process.env.R2_ACCOUNT_ID,
  bucket = process.env.R2_BUCKET;
if (!account || !bucket || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY)
  throw new Error(
    'Set the dedicated R2 bucket credentials in ignored .env.r2.local before uploading.',
  );
if (!/^[a-f0-9]{32}$/.test(account) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))
  throw new Error('Invalid R2 account or bucket');
const client = new S3Client({
  region: 'auto',
  requestChecksumCalculation: 'WHEN_REQUIRED',
  endpoint: `https://${account}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
await client.send(new HeadBucketCommand({ Bucket: bucket }));
// Bucket configuration is optional: upload-only keys need no admin access.
if (process.argv.includes('--configure-cors')) {
  // Preserve any existing rules in the dedicated public bucket.
  let cors = [];
  try {
    cors = (await client.send(new GetBucketCorsCommand({ Bucket: bucket }))).CORSRules ?? [];
  } catch (error) {
    if (
      !['NoSuchCORSConfiguration', 'NoSuchCORSConfigurationException'].includes(error.name) &&
      error.$metadata?.httpStatusCode !== 404
    )
      throw error;
  }
  const rule = {
    ID: 'hisaab-map-read',
    AllowedOrigins: ['https://adiram.me', 'https://www.adiram.me', 'http://127.0.0.1:3000'],
    AllowedMethods: ['GET', 'HEAD'],
    AllowedHeaders: ['Range', 'If-Match'],
    ExposeHeaders: ['ETag', 'Content-Length', 'Content-Range', 'Accept-Ranges'],
    MaxAgeSeconds: 86400,
  };
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: { CORSRules: [...cors.filter((r) => r.ID !== rule.ID), rule] },
    }),
  );
}
let cursor = 0,
  completed = 0;
async function upload(file) {
  const key = manifest.prefix + '/' + file.key;
  try {
    const existing = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (existing.ContentLength !== file.bytes || existing.Metadata?.sha256 !== file.sha256)
      throw new Error('Immutable remote object conflict');
  } catch (error) {
    if (!['NotFound', 'NoSuchKey'].includes(error.name) && error.$metadata?.httpStatusCode !== 404)
      throw error;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: readFileSync(root + '/' + file.key),
        ContentLength: file.bytes,
        ContentType: file.contentType,
        ContentEncoding: file.contentEncoding,
        CacheControl: manifest.cacheControl,
        Metadata: { sha256: file.sha256 },
      }),
    );
  }
  completed++;
  if (completed % 250 === 0)
    console.log(`Preserved ${completed}/${manifest.files.length} map objects`);
}
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (cursor < manifest.files.length) {
      const file = manifest.files[cursor++];
      await upload(file);
    }
  }),
);
const bytes = readFileSync(root + '/manifest.json');
await client.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: manifest.prefix + '/manifest.json',
    Body: bytes,
    ContentType: 'application/json',
    CacheControl: manifest.cacheControl,
  }),
);
writeFileSync(
  root + '/upload-status.json',
  JSON.stringify({
    uploadedAt: new Date().toISOString(),
    prefix: manifest.prefix,
    bucket,
    objects: completed,
    records: manifest.count,
  }),
);
console.log(
  JSON.stringify({
    complete: true,
    objects: completed,
    records: manifest.count,
    prefix: manifest.prefix,
  }),
);
