import { readPublishedWork } from '@/lib/catalogue';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const work = await readPublishedWork(id);
  return work
    ? Response.json({ stages: work.stages, physicalVerification: work.physicalVerification })
    : Response.json({ error: 'Work not found' }, { status: 404 });
}
