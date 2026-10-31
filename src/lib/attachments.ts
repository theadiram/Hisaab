import 'server-only';
import { PDFDocument } from 'pdf-lib';
import { randomUUID, createHash } from 'node:crypto';
import {
  reportClient,
  readReport,
  hashToken,
  encryptBytes,
  encryptedJson,
  decryptedJson,
  decryptBytes,
} from './reports';
type Attachment = {
  id: string;
  path: string;
  sha256: string;
  metadata: { blob: string };
  createdAt: string;
};
export async function listAttachments(token: string) {
  if (!(await readReport(token))) throw new Error('Active private case required');
  const result = await reportClient().rpc('list_case_attachments', { p_hash: hashToken(token) });
  if (result.error) throw new Error('Private attachments unavailable');
  return result.data as Attachment[];
}
export async function storeAttachment(
  token: string,
  bytes: Buffer,
  name: string,
  acknowledgement = false,
) {
  if (!(await readReport(token))) throw new Error('Active private case required');
  if (bytes.length > 10 * 1024 * 1024 || !bytes.subarray(0, 8).toString().startsWith('%PDF-'))
    throw new Error('Choose a PDF no larger than 10 MB');
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  if (pdf.getPageCount() < 1 || pdf.getPageCount() > 100)
    throw new Error('PDF must contain 1–100 pages');
  const client = reportClient(),
    id = randomUUID(),
    hash = hashToken(token),
    path = `${hash}/${id}.enc`,
    sha = createHash('sha256').update(bytes).digest('hex');
  const uploaded = await client.storage
    .from('case-documents')
    .upload(path, await encryptBytes(bytes), {
      contentType: 'application/octet-stream',
      upsert: false,
    });
  if (uploaded.error) throw new Error('Private attachment storage unavailable');
  const result = await client.rpc('register_case_attachment', {
    p_id: id,
    p_hash: hash,
    p_path: path,
    p_sha: sha,
    p_metadata: await encryptedJson({ name: name.slice(0, 160), pages: pdf.getPageCount() }),
    p_event: acknowledgement
      ? await encryptedJson({
          description:
            'Acknowledgement PDF supplied by the citizen; authenticity has not been independently verified.',
          date: new Date().toISOString().slice(0, 10),
          reference: id,
          attachmentId: id,
        })
      : null,
  });
  if (result.error) {
    await client.storage.from('case-documents').remove([path]);
    throw new Error('Attachment limit reached or case expired');
  }
  return { id, sha256: sha, verification: 'citizen_provided_unverified' };
}
export async function attachmentMetadata(token: string) {
  return Promise.all(
    (await listAttachments(token)).map(async (a) => ({
      id: a.id,
      sha256: a.sha256,
      createdAt: a.createdAt,
      ...(await decryptedJson(a.metadata)),
      verification: 'citizen_provided_unverified',
    })),
  );
}
export async function readAttachment(token: string, id: string) {
  const item = (await listAttachments(token)).find((a) => a.id === id);
  if (!item) return null;
  const result = await reportClient().storage.from('case-documents').download(item.path);
  if (result.error) throw new Error('Attachment unavailable');
  const original = await decryptBytes(Buffer.from(await result.data.arrayBuffer()));
  if (createHash('sha256').update(original).digest('hex') !== item.sha256)
    throw new Error('Attachment checksum mismatch');
  return original;
}
