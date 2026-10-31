import { developmentSelection } from '@/lib/development';
import { readDevelopment } from '@/lib/development-db';
export async function GET(request: Request) {
  let selection;
  try {
    selection = developmentSelection(new URL(request.url).searchParams);
  } catch {
    return Response.json({ error: 'Invalid development filters' }, { status: 400 });
  }
  try {
    return Response.json(await readDevelopment(selection), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json(
      {
        error: 'Reviewed development records are unavailable. No zero amount has been substituted.',
        complete: false,
      },
      { status: 503 },
    );
  }
}
