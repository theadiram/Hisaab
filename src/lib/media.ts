import 'server-only';
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { readReport, hashToken, encryptBytes, reportClient } from './reports';
export async function storePhoto(token: string, bytes: Buffer) {
  if (!(await readReport(token))) throw new Error('Private case access required');
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Photograph exceeds 10 MB');
  if (process.env.HISAAB_DATA_MODE !== 'supabase')
    throw new Error('Private photo storage is not configured');
  const image = sharp(bytes, { limitInputPixels: 40000000, failOn: 'warning' });
  const metadata = await image.metadata();
  if (
    !metadata.format ||
    !['jpeg', 'png', 'webp'].includes(metadata.format) ||
    (metadata.pages && metadata.pages > 1)
  )
    throw new Error('Only single-frame JPEG, PNG or WebP photographs are accepted');
  const derivative = await image
    .rotate()
    .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  const id = randomUUID();
  const hash = hashToken(token);
  const originalPath = `${hash}/${id}.enc`;
  const derivativePath = `${hash}/${id}.webp`;
  const client = reportClient();
  const original = await client.storage
    .from('case-originals')
    .upload(originalPath, await encryptBytes(bytes), {
      contentType: 'application/octet-stream',
      upsert: false,
    });
  if (original.error) throw new Error('Private original storage unavailable');
  const preview = await client.storage
    .from('case-derivatives')
    .upload(derivativePath, derivative, { contentType: 'image/webp', upsert: false });
  if (preview.error) {
    await client.storage.from('case-originals').remove([originalPath]);
    throw new Error('Private derivative storage unavailable');
  }
  const result = await client.rpc('register_case_media', {
    p_id: id,
    p_hash: hash,
    p_original: originalPath,
    p_derivative: derivativePath,
    p_original_hash: createHash('sha256').update(bytes).digest('hex'),
    p_derivative_hash: createHash('sha256').update(derivative).digest('hex'),
  });
  if (result.error) {
    await client.storage.from('case-originals').remove([originalPath]);
    await client.storage.from('case-derivatives').remove([derivativePath]);
    throw new Error('This case already has five photographs, or case access expired');
  }
  return {
    id,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    state: 'private_validated',
    public: false,
  };
}
