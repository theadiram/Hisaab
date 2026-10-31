import { spendingCoverage } from '@/lib/spending-coverage';
export async function GET() {
  try {
    return Response.json(await spendingCoverage(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Spending coverage unavailable' }, { status: 503 });
  }
}
