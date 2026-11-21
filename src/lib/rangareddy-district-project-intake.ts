import { z } from 'zod';
import { validateIntake, type IntakePackage } from './intake-contract';

const editions = {
  'rangareddy-himayathsagar-dargah-khaliz-khan-form-vii-2026': {
    hash: '12f51f19751c7cc6afcff08c52fd2416147611e6e05b9f190bb262924b651dd5',
    url: 'https://cdn.s3waas.gov.in/s3addfa9b7e234254d26e9c7f2af1005cb/uploads/2026/09/17907615122374.pdf',
    name: 'Rangareddy Gazette No.110: Himayathsagar Bund Improvement and Eco Project',
    projectId: 'Himayathsagar Bund Improvement & Eco Project',
  },
  'rangareddy-greenfield-radial-road-form-vii-2026': {
    hash: '5ebbda57de7c60ef4e94b70b25bab46dd50e3e45de0b1871460c2baee3764560',
    url: 'https://cdn.s3waas.gov.in/s3addfa9b7e234254d26e9c7f2af1005cb/uploads/2026/09/17904122296078.pdf',
    name: 'Rangareddy Form VII publication request: Raviryal-Meerkhanpet Greenfield Radial Road',
    projectId: 'Greenfield Radial Road Phase I: Raviryal-Meerkhanpet',
  },
  'rangareddy-mamidipally-airport-road-form-c-2025': {
    hash: 'ce9b2711a577ecfed9f3d5787ed3cab9c7b4d20d3456149cc7fdac89fa8d946e',
    url: 'https://cdn.s3waas.gov.in/s3addfa9b7e234254d26e9c7f2af1005cb/uploads/2025/12/17654502528703.pdf',
    name: 'Rangareddy Gazette No.30: Mamidipally external road to the airport boundary',
    projectId: 'Mamidipally external road to airport boundary',
  },
} as const;

type SourceId = keyof typeof editions;

const candidateSchema = z
  .object({
    id: z.string().min(1).max(240),
    stateCode: z.literal('36'),
    financialYear: z.enum(['2025-2026', '2026-2027']),
    district: z.literal('Rangareddy'),
    districtAreaId: z.literal('rangareddy-district'),
    title: z.string().min(1).max(1000),
    sourceProjectId: z.enum([
      'Himayathsagar Bund Improvement & Eco Project',
      'Greenfield Radial Road Phase I: Raviryal-Meerkhanpet',
      'Mamidipally external road to airport boundary',
    ]),
    officialIds: z.array(z.string().min(1)).min(2).max(3),
    projectIdBasis: z.literal('official_gazette_or_notice_identifiers'),
    purpose: z.enum(['environment', 'transport']),
    stage: z.enum([
      'land_acquisition_public_declaration',
      'land_acquisition_form_vii_publication_request',
      'preliminary_land_acquisition_notification',
    ]),
    stageDate: z.iso.date(),
    stageDateBasis: z.literal('printed_notice_or_gazette_date'),
    publishingAuthority: z.literal('District Collector, Rangareddy'),
    mandals: z.array(z.string().min(1)).min(1).max(5),
    villages: z.array(z.string().min(1)).min(1).max(10),
    sourceExtent: z.string().min(1).max(300),
    location: z.null(),
    locationPrecision: z.literal('district'),
    projectCostRupees: z.null(),
    contractAmountRupees: z.null(),
    paymentAmountRupees: z.null(),
    completionDate: z.null(),
    sourceDocumentContainsAffectedPartyRecords: z.literal(true),
    reviewStatus: z.literal('awaiting_review'),
    publicationApproved: z.literal(false),
    source: z
      .object({
        url: z.url(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        retrievedAt: z.iso.datetime({ offset: true }),
        locator: z.string().min(1).max(1200),
        publicationDate: z.iso.date(),
      })
      .passthrough(),
    notes: z.string().min(1).max(3000),
  })
  .passthrough();

const candidatesSchema = z
  .object({
    version: z.literal('state-development-candidates/1'),
    stateCode: z.literal('36'),
    projectCandidates: z.array(z.unknown()),
  })
  .passthrough();

const documentSchema = z
  .object({
    sourceId: z.enum(Object.keys(editions) as [SourceId, ...SourceId[]]),
    url: z.url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    retrievedAt: z.iso.datetime({ offset: true }),
    contentType: z.literal('application/pdf'),
    permissionStatus: z.literal('review_pending'),
    publication: z.literal('private_only'),
    publicationDate: z.iso.date(),
    bytes: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
  })
  .passthrough();

const checkpointSchema = z
  .object({
    code: z.literal('36'),
    documents: z.array(z.record(z.string(), z.unknown())),
  })
  .passthrough();

export function prepareRangareddyDistrictProjectIntake(
  candidatesInput: unknown,
  checkpointInput: unknown,
): IntakePackage {
  const candidates = candidatesSchema.parse(candidatesInput);
  const checkpoint = checkpointSchema.parse(checkpointInput);
  const documents = checkpoint.documents
    .filter((document) => typeof document.sourceId === 'string' && document.sourceId in editions)
    .map((document) => documentSchema.parse(document));
  if (documents.length !== 3 || new Set(documents.map((document) => document.sourceId)).size !== 3)
    throw new Error('Expected three distinct Rangareddy project-notice documents');

  const documentByHash = new Map(documents.map((document) => [document.sha256, document]));
  for (const document of documents) {
    const edition = editions[document.sourceId];
    if (document.sha256 !== edition.hash || document.url !== edition.url)
      throw new Error('Rangareddy project-notice source identity changed');
  }

  const rows = z
    .array(candidateSchema)
    .parse(
      candidates.projectCandidates.filter(
        (row) =>
          typeof row === 'object' &&
          row !== null &&
          'source' in row &&
          typeof row.source === 'object' &&
          row.source !== null &&
          'sha256' in row.source &&
          typeof row.source.sha256 === 'string' &&
          documentByHash.has(row.source.sha256),
      ),
    );
  const expectedProjects = new Set(
    Object.values(editions).map((edition) => `${edition.hash}:${edition.projectId}`),
  );
  const actualProjects = new Set(rows.map((row) => `${row.source.sha256}:${row.sourceProjectId}`));
  if (
    rows.length !== 3 ||
    actualProjects.size !== expectedProjects.size ||
    [...actualProjects].some((identity) => !expectedProjects.has(identity))
  )
    throw new Error('Expected one bounded project from each Rangareddy notice');

  const projects = rows.map((row) => {
    const document = documentByHash.get(row.source.sha256)!;
    const edition = editions[document.sourceId];
    if (
      row.source.url !== document.url ||
      row.source.retrievedAt !== document.retrievedAt ||
      row.source.publicationDate !== document.publicationDate ||
      row.stageDate !== document.publicationDate ||
      row.sourceProjectId !== edition.projectId
    )
      throw new Error('Rangareddy project source identity or date changed');
    const receipt = {
      id: `${row.id}:project-header`,
      title: edition.name,
      url: row.source.url,
      documentHash: row.source.sha256,
      locator: row.source.locator,
      retrievedAt: row.source.retrievedAt,
      rawText: `${row.stage} dated ${row.stageDate}; ${row.sourceExtent}; ${row.mandals.join(', ')} mandal(s); ${row.villages.join(', ')} village(s).`,
      permission:
        'Official public gazette; affected-party schedules remain private and reuse requires owner review.',
    };
    const missingStage = (
      id: 'sanction' | 'award' | 'payment' | 'completion',
      label: string,
      description: string,
    ) => ({
      id,
      label,
      state: 'missing' as const,
      date: null,
      amount: null,
      description,
      reviewStatus: 'pending' as const,
      receipts: [],
    });
    return {
      id: row.id,
      title: row.title,
      purpose: row.purpose,
      state: 'Telangana',
      district: row.district,
      areaId: row.districtAreaId,
      financialYear: row.financialYear,
      officialIds: row.officialIds,
      location: null,
      locationPrecision: 'district' as const,
      authority: null,
      authorityReceipt: null,
      physicalVerification: 'Not performed; project-header evidence from an official gazette only.',
      summary: `${row.stage.replaceAll('_', ' ')} dated ${row.stageDate}. Source extent: ${row.sourceExtent}. Named geography: ${row.mandals.join(', ')} mandal(s); ${row.villages.join(', ')} village(s). Affected-party schedules are excluded.`,
      roles: [
        {
          id: `${row.id}:district-collector-role`,
          name: 'District Collector, Rangareddy',
          role: 'land-acquisition notice publisher',
          organisation: 'Rangareddy District Administration',
          receipt,
          photoUrl: null,
          photoSource: null,
          identityBasis: 'official_id' as const,
        },
      ],
      stages: [
        missingStage(
          'sanction',
          'Administrative or financial sanction',
          'Not established by the normalized project header.',
        ),
        missingStage('award', 'Contract award', 'No tender or contract award is normalized.'),
        missingStage('payment', 'Payment', 'No bill, payee or payment is normalized.'),
        missingStage(
          'completion',
          'Completion',
          'No physical progress or completion evidence is normalized.',
        ),
      ],
      money: [],
    };
  });

  const cutoff = documents
    .map((document) => document.retrievedAt.slice(0, 10))
    .sort()
    .at(-1)!;
  return validateIntake({
    version: 'hisaab-intake/1',
    batchId: `telangana-rangareddy-district-projects-${cutoff}`,
    jurisdiction: '36',
    cutoff,
    sources: documents.map((document) => {
      const edition = editions[document.sourceId];
      return {
        id: document.sourceId,
        name: edition.name,
        family: 'district_land_acquisition_gazette',
        hash: document.sha256,
        url: document.url,
        storagePath: `${document.sourceId}/${document.sha256}`,
        contentType: document.contentType,
        retrievedAt: document.retrievedAt,
        reuseBasis:
          'Official public Rangareddy gazette; affected-party schedules remain private and reuse rights require owner review.',
      };
    }),
    projects,
    funding: [],
    assets: [],
    contracts: [],
    payments: [],
    allocations: [],
    parties: [],
    completion: [],
    coverage: {
      denominator: null,
      denominatorSource: null,
      years: ['2025-2026', '2026-2027'],
      missing: [
        'These three project headers are not a denominator for Rangareddy District projects.',
        'Administrative and financial sanction, cost, contract, payment, progress and completion remain missing.',
        'Village and mandal names do not establish a precise project geometry or map point.',
        'Affected-party names and parcel-level schedules are deliberately excluded and remain private.',
      ],
      nextAction:
        'Obtain non-personal sanction orders, implementing-agency records, project geometry, contracts, bills, payments and completion evidence.',
      checkpoint:
        'Three official source hashes and project headers were validated locally; originals, affected-party schedules and generated candidates remain private and unapproved.',
    },
  }).package;
}
