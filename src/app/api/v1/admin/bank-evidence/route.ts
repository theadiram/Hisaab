import { requireAdmin } from '@/lib/admin';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return Response.json(
      { error: 'Sign in with owner MFA to inspect unpublished payment evidence.' },
      { status: 401, headers },
    );
  }
  const params = new URL(request.url).searchParams;
  const pageText = params.get('page') ?? '1',
    query = (params.get('q') ?? '').trim();
  if (!/^\d{1,6}$/.test(pageText) || Number(pageText) < 1 || query.length > 100)
    return Response.json({ error: 'Invalid search or page.' }, { status: 400, headers });
  try {
    const [text, summaryText] = await Promise.all([
      readFile(
        path.join(process.cwd(), 'data/acquisition/ommas-financial/bank-payment-records.jsonl'),
        'utf8',
      ),
      readFile(path.join(process.cwd(), 'data/bank-payment-acquisition.json'), 'utf8'),
    ]);
    const summary = JSON.parse(summaryText);
    const records = text
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const search = query.toLocaleLowerCase('en-IN');
    const matched = records.filter(
      (r) =>
        !search ||
        [r.billNumber, r.paymentReference, r.implementingUnit].some((value) =>
          String(value ?? '')
            .toLocaleLowerCase('en-IN')
            .includes(search),
        ),
    );
    const page = Number(pageText),
      pageSize = 25;
    return Response.json(
      {
        summary,
        total: matched.length,
        page,
        pageSize,
        records: matched
          .slice((page - 1) * pageSize, page * pageSize)
          .map((r) => ({
            id: r.id,
            implementingUnit: r.implementingUnit,
            billNumber: r.billNumber,
            billDate: r.billDate,
            paymentReference: r.paymentReference,
            chequeAmount: r.chequeAmount,
            bankStatus: r.bankStatus,
            bankReportedTransactionDate: r.bankReportedTransactionDate,
            amountBasis: r.amountBasis,
            projectId: null,
            payee: null,
            approved: false,
          })),
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'Preserved payment evidence is unavailable on this server.' },
      { status: 503, headers },
    );
  }
}
