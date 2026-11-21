import { z } from 'zod';
import { validateIntake, type IntakePackage } from './intake-contract';

const editions = {
  'hyderabad-district-gandhi-sarovar-land-acquisition-2026': {
    hash: 'cb9e669c3ee6eecfe24e0e6e00f0d2282c0a5eb78baa403c8696f9e1236bfe2b',
    url: 'https://hyderabad.telangana.gov.in/notice/land-acquisition-hyderabad-district-langer-house-and-quila-mohd-nagar-villages-of-golconda-mandal-musi-riverfront-development-corporation-limited-mrdcl-gandhi-sarovar-project-as/',
    name: 'Hyderabad District land-acquisition notice for the MRDCL Gandhi Sarovar project',
    projectId: 'MRDCL Gandhi Sarovar Project',
  },
  'hyderabad-district-sh01-land-acquisition-2026': {
    hash: 'eb91dfc7f76d08c37c7d204fe2246a9221bd3c63127dfbf131557fc936cf4bac',
    url: 'https://hyderabad.telangana.gov.in/notice/land-acquisition-hyderabad-district-tirumalagiri-mandal-thokatta-kakagudatirumalagirimachabollaram-villages-elevated-corridor-from-paradise-junction-to-shamirpet-at-orr-junction-on-rajiv-ra-3/',
    name: 'Hyderabad District land-acquisition declarations for the SH-01 elevated corridor',
    projectId: 'SH-01',
  },
  'hyderabad-district-nh44-land-acquisition-2026': {
    hash: 'c6849788f9870a3fe5b26f0192c57b4231fc7a0d6eca11225498867c85411551',
    url: 'https://hyderabad.telangana.gov.in/notice/land-acquisition-publication-of-declaration-gazette-no-234567-has-been-approved-by-the-district-collector-hyderabad-for-construction-of-elevated-corridor-from-paradise-junction-to-bowenpally-d/',
    name: 'Hyderabad District land-acquisition declarations for the NH-44 elevated corridor',
    projectId: 'NH-44',
  },
} as const;

type SourceId = keyof typeof editions;

const sourceSchema = z
  .object({
    url: z.url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    retrievedAt: z.iso.datetime({ offset: true }),
    locator: z.string().min(1).max(1200),
    publishingAuthority: z.literal('District Collector, Hyderabad'),
    publicationDate: z.iso.date(),
  })
  .passthrough();

const candidateSchema = z
  .object({
    id: z.string().min(1).max(240),
    stateCode: z.literal('36'),
    financialYear: z.literal('2026-2027'),
    district: z.literal('Hyderabad'),
    districtAreaId: z.literal('hyderabad-district'),
    title: z.string().min(1).max(1000),
    sourceProjectId: z.enum(['MRDCL Gandhi Sarovar Project', 'SH-01', 'NH-44']),
    officialIds: z.array(z.string().min(1)).min(2).max(3),
    projectIdBasis: z.literal('official_project_route_and_notice_labels'),
    purpose: z.enum(['infrastructure', 'transport']),
    stage: z.enum([
      'preliminary_land_acquisition_notification',
      'land_acquisition_public_declaration',
    ]),
    stageDate: z.iso.date(),
    stageDateBasis: z.literal('district_notice_start_date'),
    publishingAuthority: z.literal('District Collector, Hyderabad'),
    implementingAgency: z.string().min(1).max(300).nullable(),
    mandals: z.array(z.string().min(1)).min(1).max(5),
    villages: z.array(z.string().min(1)).min(2).max(10),
    location: z.null(),
    locationPrecision: z.literal('district'),
    projectCostRupees: z.null(),
    contractAmountRupees: z.null(),
    paymentAmountRupees: z.null(),
    completionDate: z.null(),
    linkedNoticeDocumentCount: z.number().int().positive().max(20),
    reviewStatus: z.literal('awaiting_review'),
    publicationApproved: z.literal(false),
    source: sourceSchema,
    notes: z.string().min(1).max(3000),
  })
  .passthrough();

const candidatesSchema = z
  .object({
    version: z.literal('state-development-candidates/1'),
    stateCode: z.literal('36'),
    projectCandidates: z.array(candidateSchema),
  })
  .passthrough();

const documentSchema = z
  .object({
    sourceId: z.enum(Object.keys(editions) as [SourceId, ...SourceId[]]),
    url: z.url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    retrievedAt: z.iso.datetime({ offset: true }),
    contentType: z.literal('text/html'),
    permissionStatus: z.literal('review_pending'),
    publication: z.literal('private_only'),
    bytes: z
      .number()
      .int()
      .positive()
      .max(2 * 1024 * 1024),
  })
  .passthrough();

const checkpointSchema = z
  .object({
    code: z.literal('36'),
    documents: z.array(z.record(z.string(), z.unknown())),
  })
  .passthrough();

export function prepareHyderabadDistrictProjectIntake(
  candidatesInput: unknown,
  checkpointInput: unknown,
): IntakePackage {
  const candidates = candidatesSchema.parse(candidatesInput);
  const checkpoint = checkpointSchema.parse(checkpointInput);
  const documents = checkpoint.documents
    .filter((document) => typeof document.sourceId === 'string' && document.sourceId in editions)
    .map((document) => documentSchema.parse(document));
  if (documents.length !== 3 || new Set(documents.map((document) => document.sourceId)).size !== 3)
    throw new Error('Expected three distinct Hyderabad District project-notice documents');

  const documentByHash = new Map(documents.map((document) => [document.sha256, document]));
  for (const document of documents) {
    const edition = editions[document.sourceId];
    if (document.sha256 !== edition.hash || document.url !== edition.url)
      throw new Error('Hyderabad District project-notice source identity changed');
  }

  const rows = candidates.projectCandidates.filter((row) => documentByHash.has(row.source.sha256));
  const expectedProjects = new Set(
    Object.values(editions).map((edition) => `${edition.hash}:${edition.projectId}`),
  );
  const actualProjects = new Set(rows.map((row) => `${row.source.sha256}:${row.sourceProjectId}`));
  if (
    rows.length !== 3 ||
    actualProjects.size !== expectedProjects.size ||
    [...actualProjects].some((identity) => !expectedProjects.has(identity))
  )
    throw new Error('Expected one bounded project from each Hyderabad District notice');

  const projects = rows.map((row) => {
    const document = documentByHash.get(row.source.sha256)!;
    const edition = editions[document.sourceId];
    if (
      row.source.url !== document.url ||
      row.source.retrievedAt !== document.retrievedAt ||
      row.sourceProjectId !== edition.projectId
    )
      throw new Error('Hyderabad District project source identity changed');
    const receipt = {
      id: `${row.id}:district-notice`,
      title: edition.name,
      url: row.source.url,
      documentHash: row.source.sha256,
      locator: row.source.locator,
      retrievedAt: row.source.retrievedAt,
      rawText: `${row.stage} dated ${row.stageDate}; ${row.mandals.join(', ')} mandal(s); ${row.villages.join(', ')} village(s).`,
      permission: 'Official public district notice; reuse remains pending owner review.',
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
      physicalVerification: 'Not performed; official district land-acquisition notice only.',
      summary: `${row.stage.replaceAll('_', ' ')} dated ${row.stageDate}. Named geography: ${row.mandals.join(', ')} mandal(s); ${row.villages.join(', ')} village(s). No financial or completion stage is established.`,
      roles: [
        {
          id: `${row.id}:district-collector-role`,
          name: 'District Collector, Hyderabad',
          role: 'land-acquisition notice publisher',
          organisation: 'Hyderabad District Administration',
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
          'Not established by the district land-acquisition notice.',
        ),
        missingStage('award', 'Contract award', 'No tender or contract award is supplied.'),
        missingStage('payment', 'Payment', 'No bill, payee or payment is supplied.'),
        missingStage(
          'completion',
          'Completion',
          'No physical progress or completion evidence is supplied.',
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
    batchId: `telangana-hyderabad-district-projects-${cutoff}`,
    jurisdiction: '36',
    cutoff,
    sources: documents.map((document) => {
      const edition = editions[document.sourceId];
      return {
        id: document.sourceId,
        name: edition.name,
        family: 'district_land_acquisition_notice',
        hash: document.sha256,
        url: document.url,
        storagePath: `${document.sourceId}/${document.sha256}`,
        contentType: document.contentType,
        retrievedAt: document.retrievedAt,
        reuseBasis:
          'Official public Hyderabad District notice page; reuse rights remain pending owner review before publication.',
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
      years: ['2026-2027'],
      missing: [
        'These three notices are not a denominator for all Hyderabad District projects.',
        'Administrative and financial sanction, cost, contract, payment, progress and completion remain missing.',
        'Village names do not establish a precise project geometry or map point.',
        'Linked gazettes may include affected-party records and remain private source material.',
      ],
      nextAction:
        'Obtain sanction orders, implementing-agency identifiers, project geometry, contracts, bills, payments and completion evidence without publishing affected-party records.',
      checkpoint:
        'Three official district-page hashes and project identities were validated locally; linked gazettes and generated candidates remain private and unapproved.',
    },
  }).package;
}
