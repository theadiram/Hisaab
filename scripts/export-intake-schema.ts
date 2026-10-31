import { writeFile, mkdir } from 'node:fs/promises';
import { z } from 'zod';
import { intakeContract } from '../src/lib/intake-contract';
import { fundingStates, fundingYears } from '../src/lib/funding';
await mkdir('docs/data-intake', { recursive: true });
await writeFile(
  'docs/data-intake/hisaab-intake.schema.json',
  JSON.stringify(z.toJSONSchema(intakeContract, { unrepresentable: 'any' }), null, 2) + '\n',
);
await writeFile(
  'docs/data-intake/state-jobs.json',
  JSON.stringify(
    {
      version: 'hisaab-collector-jobs/1',
      status: 'prepared_not_dispatched',
      years: fundingYears,
      jobs: fundingStates.map((s) => ({
        jurisdiction: s.code,
        name: s.name,
        status: 'unassigned',
        priority:
          s.code === '21'
            ? 'Existing road and panchayat pilots'
            : s.code === '7'
              ? 'Existing Delhi SER-2 and NCRTC dossiers'
              : 'Establish strongest complete pilot chain',
        method: 'docs/data-acquisition-contract.md',
        routes: [
          'official_public_reports',
          'authorized_export_or_api',
          'targeted_rti_draft',
          'agency_pilot_draft',
        ],
        deliverables: [
          'preserved originals',
          'hisaab-intake/1 batches',
          'explicit gaps',
          'source rights',
          'checkpoint',
        ],
        newOutboundAuthorization: false,
        paidAccessAuthorization: false,
        publication: 'private_pending_review',
      })),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Intake schema and 36 unassigned collector jobs written. Runtime semantic validation remains mandatory.',
);
