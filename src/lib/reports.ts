import 'server-only';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { privateConnection } from './server-config';
export const reportInput = z.object({
  workId: z.string().max(160).nullable(),
  description: z.string().min(10).max(5000),
  observedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) => !Number.isNaN(Date.parse(v)) && new Date(v) <= new Date(),
      'Observation date must not be in the future',
    ),
  consent: z.literal(true),
  demo: z.boolean().default(false),
});
export type PrivateReport = z.infer<typeof reportInput> & {
  reference: string;
  createdAt: string;
  state: 'private_observation';
  tokenHash: string;
};
const root = () => path.join(process.cwd(), '.hisaab', 'reports');
export const hashToken = (v: string) => createHash('sha256').update(v).digest('hex');
async function key() {
  const configured = process.env.HISAAB_CAPABILITY_SECRET;
  if (configured && /^[a-f0-9]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  if (process.env.NODE_ENV === 'production' || process.env.HISAAB_DATA_MODE === 'supabase')
    throw new Error('Private case encryption is not configured. No observation was saved.');
  await mkdir(root(), { recursive: true, mode: 0o700 });
  const file = path.join(root(), '.key');
  try {
    return await readFile(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    const value = randomBytes(32);
    try {
      await writeFile(file, value, { mode: 0o600, flag: 'wx' });
      return value;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') return readFile(file);
      throw e;
    }
  }
}
export function reportClient() {
  const { url, key } = privateConnection();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
const db = reportClient;
export async function encryptBytes(bytes: Buffer) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', await key(), nonce);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
}
export async function saveReport(input: z.infer<typeof reportInput>) {
  const secret = await key();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const report: PrivateReport = {
    ...input,
    reference: `HIS-${randomBytes(5).toString('hex').toUpperCase()}`,
    createdAt: new Date().toISOString(),
    state: 'private_observation',
    tokenHash,
  };
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret, nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(report), 'utf8'), cipher.final()]);
  const envelope = {
    nonce: nonce.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
  if (process.env.HISAAB_DATA_MODE === 'supabase') {
    const { error } = await db().rpc('store_private_case', {
      p_hash: tokenHash,
      p_reference: report.reference,
      p_payload: envelope,
    });
    if (error)
      throw new Error('Private case storage rejected this report. No observation was saved.');
  } else {
    if (process.env.NODE_ENV === 'production')
      throw new Error('Private case storage is not configured. No observation was saved.');
    await writeFile(path.join(root(), `${tokenHash}.json`), JSON.stringify(envelope), {
      mode: 0o600,
      flag: 'wx',
    });
  }
  return { report, token };
}
export async function readReport(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const secret = await key();
  let raw;
  if (process.env.HISAAB_DATA_MODE === 'supabase') {
    const { data, error } = await db().rpc('read_private_case', { p_hash: hashToken(token) });
    if (error) throw new Error('Private case storage unavailable');
    if (!data) return null;
    raw = data;
  } else {
    try {
      raw = JSON.parse(await readFile(path.join(root(), `${hashToken(token)}.json`), 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }
  const cipher = createDecipheriv('aes-256-gcm', secret, Buffer.from(raw.nonce, 'base64'));
  cipher.setAuthTag(Buffer.from(raw.tag, 'base64'));
  const plaintext = Buffer.concat([
    cipher.update(Buffer.from(raw.ciphertext, 'base64')),
    cipher.final(),
  ]);
  return JSON.parse(plaintext.toString()) as PrivateReport;
}
export async function deleteReport(token: string) {
  if (!(await readReport(token))) return false;
  if (process.env.HISAAB_DATA_MODE === 'supabase') {
    const client = db();
    const media = await client.rpc('list_case_media', { p_hash: hashToken(token) });
    if (media.error) throw new Error('Media deletion unavailable');
    for (const bucket of ['case-originals', 'case-derivatives']) {
      const paths = (media.data ?? [])
        .map((m: { original_path: string; derivative_path: string }) =>
          bucket === 'case-originals' ? m.original_path : m.derivative_path,
        )
        .filter(Boolean);
      if (paths.length) {
        const r = await client.storage.from(bucket).remove(paths);
        if (r.error) throw new Error('Media deletion unavailable');
      }
    }
    const videos = await client.rpc('case_videos', { p_hash: hashToken(token) });
    if (videos.error) throw new Error('Video deletion unavailable');
    const videoPaths = (videos.data ?? []).flatMap((v: { paths: string[] }) => v.paths);
    if (videoPaths.length) {
      const deleted = await client.storage.from('case-videos').remove(videoPaths);
      if (deleted.error) throw new Error('Video deletion unavailable');
    }
    const attachments = await client.rpc('list_case_attachments', { p_hash: hashToken(token) });
    if (attachments.error) throw new Error('Attachment deletion unavailable');
    const documentPaths = (attachments.data ?? []).map((a: { path: string }) => a.path);
    if (documentPaths.length) {
      const removed = await client.storage.from('case-documents').remove(documentPaths);
      if (removed.error) throw new Error('Attachment deletion unavailable');
    }
    const { data, error } = await client.rpc('delete_private_case', { p_hash: hashToken(token) });
    if (error) throw new Error('Deletion unavailable');
    return !!data;
  }
  await unlink(path.join(root(), `${hashToken(token)}.json`));
  return true;
}
export async function decryptBytes(bytes: Buffer) {
  const cipher = createDecipheriv('aes-256-gcm', await key(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]);
}
export async function encryptedJson(value: unknown) {
  return { blob: (await encryptBytes(Buffer.from(JSON.stringify(value)))).toString('base64') };
}
export async function decryptedJson(value: { blob: string }) {
  return JSON.parse((await decryptBytes(Buffer.from(value.blob, 'base64'))).toString('utf8'));
}
