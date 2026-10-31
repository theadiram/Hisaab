import { readPublishedWork } from '@/lib/catalogue';
import { reviewQuestions } from '@/lib/analysis';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const work = await readPublishedWork(id);
  if (!work)
    return Response.json({ error: 'No published work matches this identifier' }, { status: 404 });
  return Response.json({ work, questions: reviewQuestions(work), cutoff: '2026-10-06' });
}
