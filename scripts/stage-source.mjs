import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const hash = process.argv[2];
if (!/^[a-f0-9]{64}$/.test(hash ?? '')) throw new Error('Supply a registered document SHA-256');
process.loadEnvFile('.env.hosted');
const manifest = JSON.parse(await readFile(`data/acquisition/documents/${hash}.json`, 'utf8'));
const originalOnly = process.argv.includes('--original-only');
const extraction = originalOnly
  ? { candidates: [] }
  : JSON.parse(await readFile(`data/acquisition/candidates/${hash}.json`, 'utf8'));
const original = await readFile(manifest.original);
if (createHash('sha256').update(original).digest('hex') !== hash)
  throw new Error('Original checksum mismatch');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const path = `${manifest.sourceId}/${hash}`;
const uploaded = await client.storage
  .from('source-originals')
  .upload(path, original, {
    contentType: manifest.contentType ?? 'application/pdf',
    upsert: false,
  });
if (uploaded.error && uploaded.error.statusCode !== '409')
  throw new Error('Original storage rejected upload');
const downloaded = await client.storage.from('source-originals').download(path);
if (
  downloaded.error ||
  createHash('sha256')
    .update(Buffer.from(await downloaded.data.arrayBuffer()))
    .digest('hex') !== hash
)
  throw new Error('Stored original checksum mismatch');
const result = await client.rpc('stage_ingestion', {
  p_source: {
    id: manifest.sourceId,
    name: manifest.sourceName ?? 'HPPWD PMGSY-III official work report',
    official_url: manifest.contextUrl ?? manifest.url,
    family: manifest.sourceFamily ?? 'state_publicworks',
  },
  p_document: {
    original_url: manifest.url,
    sha256: hash,
    storage_path: path,
    content_type: manifest.contentType ?? 'application/pdf',
    manifest,
    parser_version: manifest.parserVersion ?? extraction.candidates[0]?.review.mappingVersion,
  },
  p_candidates: extraction.candidates,
});
if (result.error) throw new Error('Candidate staging rejected: ' + result.error.message);
console.log(
  JSON.stringify({
    originalChecksumVerified: true,
    candidatesInserted: result.data,
    publication: 'private_pending_review',
    permissionStatus: manifest.permissionStatus ?? 'unverified',
  }),
);
