import 'server-only';
import { cookies } from 'next/headers';
import { createDecipheriv, createHash } from 'node:crypto';
import { readReport, hashToken, reportClient, decryptedJson } from './reports';
export type VideoMeta = {
  name: string;
  mime: 'video/mp4' | 'video/webm';
  size: number;
  sha256: string;
  key: string;
  nonce: string;
  expiresAt: string;
};
export async function videoSession() {
  const token = (await cookies()).get('hisaab_case')?.value;
  if (!token || !(await readReport(token))) throw new Error('Private case session required');
  return hashToken(token);
}
export async function videoRecords(hash: string) {
  const r = await reportClient().rpc('case_videos', { p_hash: hash });
  if (r.error) throw r.error;
  return Promise.all(
    (r.data ?? []).map(
      async (v: {
        id: string;
        path: string;
        paths: string[];
        status: string;
        payload: { blob: string };
      }) => ({ ...v, metadata: (await decryptedJson(v.payload)) as VideoMeta }),
    ),
  );
}
export async function videoBytes(v: { path: string; paths: string[]; metadata: VideoMeta }) {
  const client = reportClient(),
    parts: Buffer[] = [];
  let size = 0;
  for (const path of v.paths) {
    const file = await client.storage.from('case-videos').download(path);
    if (file.error) throw file.error;
    size += file.data.size;
    if (size > v.metadata.size + 16) throw new Error('Encrypted file length does not match');
    parts.push(Buffer.from(await file.data.arrayBuffer()));
  }
  if (size !== v.metadata.size + 16) throw new Error('Encrypted file length does not match');
  const raw = Buffer.concat(parts),
    cipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(v.metadata.key, 'base64'),
      Buffer.from(v.metadata.nonce, 'base64'),
    );
  cipher.setAuthTag(raw.subarray(-16));
  const bytes = Buffer.concat([cipher.update(raw.subarray(0, -16)), cipher.final()]);
  if (createHash('sha256').update(bytes).digest('hex') !== v.metadata.sha256)
    throw new Error('Original checksum does not match');
  const valid =
    v.metadata.mime === 'video/mp4'
      ? bytes.subarray(4, 8).toString() === 'ftyp'
      : bytes.subarray(0, 4).toString('hex') === '1a45dfa3';
  if (!valid) throw new Error('This is not a supported MP4 or WebM container');
  return bytes;
}
