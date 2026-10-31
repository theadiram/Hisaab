import { createHash } from 'node:crypto';
import { requireAdmin } from '@/lib/admin';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  safePaymentReview,
  safeBillBreakdown,
  safeTreasuryFlow,
  type TreasuryFlow,
  type VisibleBillBreakdown,
  type PaymentReview,
} from '@/lib/panchayat-evidence';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    await requireAdmin();
  } catch {
    return Response.json(
      { error: 'Owner MFA sign-in required to view unpublished project evidence.' },
      { status: 401, headers },
    );
  }
  try {
    const base = path.join(process.cwd(), 'data/acquisition/ppms');
    const photos = JSON.parse(
      await readFile(path.join(base, 'photo-review/five-project-photo-assessment.json'), 'utf8'),
    );
    const original = new URL(request.url).searchParams.get('photo');
    if (original) {
      const entry = photos.records.find((p: { sha256: string }) => p.sha256 === original);
      if (!/^[a-f0-9]{64}$/.test(original) || !entry)
        return Response.json({ error: 'Photo not found.' }, { status: 404, headers });
      const bytes = await readFile(path.join(base, 'photo-review', original + '.jpg'));
      if (createHash('sha256').update(bytes).digest('hex') !== original)
        throw new Error('Photo checksum mismatch');
      return new Response(new Uint8Array(bytes), {
        headers: { ...headers, 'Content-Type': 'image/jpeg' },
      });
    }
    const [data, payments, geography, breakdowns, flows] = await Promise.all([
      readFile(path.join(base, 'projects/five-panchayat-geotag-assessment.json'), 'utf8').then(
        JSON.parse,
      ),
      readFile(
        path.join(base, 'payment-details/five-project-payment-assessment.json'),
        'utf8',
      ).then(JSON.parse),
      readFile(path.join(base, 'projects/five-project-geography-review.json'), 'utf8').then(
        JSON.parse,
      ),
      readFile(
        path.join(base, 'payment-details/additional-visible-bill-details.json'),
        'utf8',
      ).then(JSON.parse),
      readFile(path.join(base, 'payment-details/pilot-visible-treasury-flow.json'), 'utf8').then(
        JSON.parse,
      ),
    ]);
    return Response.json(
      {
        candidates: data.candidates.map(
          (c: {
            project: { projectCode: string };
            geotags: unknown[];
            source: { url: string };
          }) => ({
            project: c.project,
            geotags: c.geotags,
            source: { url: c.source.url },
            photos: photos.records
              .filter((p: { projectCode: string }) => p.projectCode === c.project.projectCode)
              .map(
                (p: {
                  sha256: string;
                  sourceStage: string;
                  sourceDate: string;
                  visualObservation: string;
                }) => ({
                  sha256: p.sha256,
                  sourceStage: p.sourceStage,
                  sourceDate: p.sourceDate,
                  visualObservation: p.visualObservation,
                }),
              ),
            geographyReview: geography.records.find(
              (r: { projectCode: string }) => r.projectCode === c.project.projectCode,
            ),
            treasuryFlows: flows.records
              .filter((r: TreasuryFlow) => r.projectCode === c.project.projectCode)
              .map(safeTreasuryFlow),
            billBreakdowns: breakdowns.records
              .filter((r: VisibleBillBreakdown) => r.projectCode === c.project.projectCode)
              .map(safeBillBreakdown),
            payments: payments.records
              .filter((r: PaymentReview) => r.projectCode === c.project.projectCode)
              .map(safePaymentReview),
          }),
        ),
        approved: false,
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'Panchayat project evidence unavailable.' },
      { status: 503, headers },
    );
  }
}
