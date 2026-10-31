import { requireAdmin } from '@/lib/admin';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    await requireAdmin();
  } catch {
    return Response.json(
      { error: 'Owner MFA sign-in required to view private requests.' },
      { status: 401, headers },
    );
  }
  try {
    const names = [
      'delhi-evidence-pilot-plan-2026-10-09.md',
      'delhi-ser2-record-request.md',
      'delhi-custodian-routing.md',
      'delhi-ser2-pilot-findings.md',
      'delhi-authority-source-inventory.md',
      'delhi-ncrtc-record-request.md',
      'department-sample-export-template.md',
      'ppms-expanded-evidence-review.md',
      'department-followup-drafts.md',
      'mplads-pilot-payment-record-request.md',
      'mplads-supporting-payment-review.md',
      'roads-rti-draft.md',
      'panchayat-rti-draft.md',
      'agency-pilot-proposal.md',
      'project-payment-record-request.md',
      'ppms-record-request.md',
      'nationwide-payment-source-research.md',
      'payment-source-hunt-agent-prompt.md',
      'state-payment-source-assessment.md',
    ];
    const requests = await Promise.all(
      names.map(async (name) => ({
        name,
        text: await readFile(path.join(process.cwd(), 'docs', name), 'utf8'),
      })),
    );
    requests.push({
      name: 'delhi-ncrtc-payment-candidate.md',
      text: await readFile(
        path.join(process.cwd(), 'data/acquisition/delhi-ncrtc-research/README.md'),
        'utf8',
      ),
    });
    return Response.json({ requests }, { headers });
  } catch {
    return Response.json({ error: 'Request dossier unavailable' }, { status: 503, headers });
  }
}
