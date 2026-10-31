import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { requireAdmin } from '@/lib/admin';
import { locationReview } from '@/lib/ppms-location-review';
import {
  safePaymentReview,
  safeBillBreakdown,
  type PaymentReview,
  type VisibleBillBreakdown,
} from '@/lib/panchayat-evidence';
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    await requireAdmin();
  } catch {
    return Response.json(
      { error: 'Owner MFA sign-in required to inspect project location evidence.' },
      { status: 401, headers },
    );
  }
  try {
    const base = path.join(process.cwd(), 'data/acquisition/ppms/projects');
    const [dossiers, locations, payments, breakdowns, gaps] = await Promise.all([
      readFile(path.join(base, 'balangir-dossiers.json'), 'utf8').then(JSON.parse),
      readFile(path.join(base, 'expanded-location-assessment.json'), 'utf8').then(JSON.parse),
      readFile(path.join(base, '../state-payment-details/assessment.json'), 'utf8').then(
        JSON.parse,
      ),
      readFile(
        path.join(base, '../payment-details/additional-visible-bill-details.json'),
        'utf8',
      ).then(JSON.parse),
      readFile(path.join(base, 'pilot-gap-register.json'), 'utf8').then(JSON.parse),
    ]);
    const index = new Map<string, Parameters<typeof locationReview>[0]>(
      dossiers.dossiers.map((d: Parameters<typeof locationReview>[0]) => [d.projectCode, d]),
    );
    const gapIndex = new Map<string, NonNullable<Parameters<typeof locationReview>[4]>>(
      gaps.cases.map((g: NonNullable<Parameters<typeof locationReview>[4]>) => [g.projectCode, g]),
    );
    const records = locations.records.map((l: Parameters<typeof locationReview>[1]) => {
      const d = index.get(l.projectCode);
      if (!d) throw new Error('Project dossier missing');
      const docs = payments.records
        .filter(
          (p: PaymentReview & { sourceUrl: string; reportConflict: boolean }) =>
            p.projectCode === l.projectCode && !p.reportConflict,
        )
        .map((p: PaymentReview & { sourceUrl: string }) =>
          safePaymentReview({ ...p, source: { url: p.sourceUrl } }),
        );
      const components = breakdowns.records
        .filter((b: VisibleBillBreakdown) => b.projectCode === l.projectCode)
        .map(safeBillBreakdown);
      const checklist = gapIndex.get(l.projectCode);
      if (!checklist) throw new Error('Project gap checklist missing');
      return locationReview(d, l, docs, components, checklist);
    });
    return Response.json(
      {
        records,
        pendingObservedLinks: locations.pendingObservedLinks,
        failures: locations.failures.length,
        scope: locations.scope,
        approved: false,
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'Location evidence unavailable; no publication status changed.' },
      { status: 503, headers },
    );
  }
}
