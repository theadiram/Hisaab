import { cookies } from 'next/headers';
import { boundedBody, BodyLimitError } from '@/lib/request-body';
import { requireOrigin } from '@/lib/security';
import { operatingLimit } from '@/lib/operating-limits';
import { attachmentMetadata, storeAttachment } from '@/lib/attachments';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() {
  const token = (await cookies()).get('hisaab_case')?.value;
  if (!token) return Response.json({ error: 'Private session required' }, { status: 401, headers });
  try {
    return Response.json({ attachments: await attachmentMetadata(token) }, { headers });
  } catch {
    return Response.json(
      { error: 'Private attachment session unavailable' },
      { status: 401, headers },
    );
  }
}
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return Response.json({ error: 'Same-origin request required' }, { status: 403, headers });
  const token = (await cookies()).get('hisaab_case')?.value;
  if (!token) return Response.json({ error: 'Private session required' }, { status: 401, headers });
  if (!(await operatingLimit(request, 'case-attachment', 15)))
    return Response.json({ error: 'Please try again later' }, { status: 429, headers });
  try {
    const bytes = await boundedBody(request, 11 * 1024 * 1024);
    const form = await new Request('http://localhost/upload', {
      method: 'POST',
      headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
      body: bytes,
    }).formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('Choose a PDF');
    return Response.json(
      await storeAttachment(
        token,
        Buffer.from(await file.arrayBuffer()),
        file.name,
        form.get('acknowledgement') === 'true',
      ),
      { status: 201, headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof BodyLimitError
            ? 'Upload too large'
            : 'PDF could not be accepted. Choose an unencrypted PDF of 1–100 pages, up to 10 MB.',
      },
      { status: e instanceof BodyLimitError ? 413 : 400, headers },
    );
  }
}
