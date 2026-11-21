import { z } from 'zod';
import { validateIntake, type IntakePackage } from './intake-contract';

const editions = {
  'medchal-madharam-industrial-park-form-c-2024': {
    hash: '3ef1e15be573f1fd7f040c0741178191f19f1cd40262c5579638a8599de7c171',
    url: 'https://cdn.s3waas.gov.in/s3da4fb5c6e93e74d3df8527599fa62642/uploads/2024/12/2024122148.pdf',
    name: 'Medchal-Malkajgiri Gazette MMD-11: Madharam Industrial Park',
    projectId: 'Madharam Industrial Park',
  },
  'medchal-kaleshwaram-ravalkola-link-form-c-2021': {
    hash: '7baefba9d73f9f6e3840f69385de8a2ab5e75ccf71b5784b85c8acb48334eeed',
    url: 'https://cdn.s3waas.gov.in/s3da4fb5c6e93e74d3df8527599fa62642/uploads/2022/06/2022062539.pdf',
    name: 'Medchal-Malkajgiri Gazette MMD-6: Kaleshwaram Ravalkola Link Canal System',
    projectId: 'Kaleshwaram Ravalkola Link Canal System',
  },
  'medchal-lothukunta-sh01-corridor-award-2026': {
    hash: '7bf3670fda0db5e4d967f7f608f9ce5b7b4878450f85bfd7e1883113e60aca8e',
    url: 'https://cdn.s3waas.gov.in/s3da4fb5c6e93e74d3df8527599fa62642/uploads/2026/04/17751199075970.pdf',
    name: 'Medchal-Malkajgiri Lothukunta award: Paradise-Shamirpet SH-01 corridor',
    projectId: 'Paradise-Shamirpet SH-01 corridor: Lothukunta award',
  },
} as const;

type SourceId = keyof typeof editions;

const candidateSchema = z
  .object({
    id: z.string().min(1).max(240),
    stateCode: z.literal('36'),
    financialYear: z.enum(['2021-2022', '2024-2025', '2025-2026']),
    district: z.literal('Medchal-Malkajgiri'),
    districtAreaId: z.literal('medchal-malkajgiri-district'),
    title: z.string().min(1).max(1000),
    sourceProjectId: z.enum([
      'Madharam Industrial Park',
      'Kaleshwaram Ravalkola Link Canal System',
      'Paradise-Shamirpet SH-01 corridor: Lothukunta award',
    ]),
    officialIds: z.array(z.string().min(1)).min(2).max(3),
    projectIdBasis: z.literal('official_gazette_or_notice_identifiers'),
    purpose: z.enum(['industry', 'irrigation', 'transport']),
    stage: z.enum(['preliminary_land_acquisition_notification', 'land_acquisition_award']),
    stageDate: z.iso.date(),
    stageDateBasis: z.literal('printed_notice_gazette_or_proceedings_date'),
    publishingAuthority: z.literal('District Collector, Medchal-Malkajgiri'),
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

export function prepareMedchalMalkajgiriDistrictProjectIntake(
  candidatesInput: unknown,
  checkpointInput: unknown,
): IntakePackage {
  const candidates = candidatesSchema.parse(candidatesInput);
  const checkpoint = checkpointSchema.parse(checkpointInput);
  const documents = checkpoint.documents
    .filter((document) => typeof document.sourceId === 'string' && document.sourceId in editions)
    .map((document) => documentSchema.parse(document));
  if (documents.length !== 3 || new Set(documents.map((document) => document.sourceId)).size !== 3)
    throw new Error('Expected three distinct Medchal-Malkajgiri project-notice documents');

  const documentByHash = new Map(documents.map((document) => [document.sha256, document]));
  for (const document of documents) {
    const edition = editions[document.sourceId];
    if (document.sha256 !== edition.hash || document.url !== edition.url)
      throw new Error('Medchal-Malkajgiri project-notice source identity changed');
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
    throw new Error('Expected one bounded project from each Medchal-Malkajgiri notice');

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
      throw new Error('Medchal-Malkajgiri project source identity or date changed');
    const receipt = {
      id: `${row.id}:project-header`,
      title: edition.name,
      url: row.source.url,
      documentHash: row.source.sha256,
      locator: row.source.locator,
      retrievedAt: row.source.retrievedAt,
      rawText: `${row.stage} dated ${row.stageDate}; ${row.sourceExtent}; ${row.mandals.join(', ')} mandal(s); ${row.villages.join(', ')} village(s).`,
      permission:
        'Official public gazette or award; affected-party and compensation schedules remain private and reuse requires owner review.',
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
      physicalVerification:
        'Not performed; project-header evidence from an official district record only.',
      summary: `${row.stage.replaceAll('_', ' ')} dated ${row.stageDate}. Source extent: ${row.sourceExtent}. Named geography: ${row.mandals.join(', ')} mandal(s); ${row.villages.join(', ')} village(s). Affected-party and compensation schedules are excluded.`,
      roles: [
        {
          id: `${row.id}:district-collector-role`,
          name: 'District Collector, Medchal-Malkajgiri',
          role: 'land-acquisition record publisher',
          organisation: 'Medchal-Malkajgiri District Administration',
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
    batchId: `telangana-medchal-malkajgiri-district-projects-${cutoff}`,
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
          'Official public Medchal-Malkajgiri record; affected-party and compensation schedules remain private and reuse rights require owner review.',
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
      years: ['2021-2022', '2024-2025', '2025-2026'],
      missing: [
        'These three project headers are not a denominator for Medchal-Malkajgiri District projects.',
        'Administrative and financial sanction, total cost, contract, payment, progress and completion remain missing.',
        'Village and mandal names do not establish a precise project geometry or map point.',
        'Affected-party names, parcel schedules, compensation amounts and payees are deliberately excluded and remain private.',
      ],
      nextAction:
        'Obtain non-personal sanction orders, implementing-agency records, project geometry, contracts, bills, payments and completion evidence.',
      checkpoint:
        'Three official source hashes and project headers were validated locally; originals, affected-party and compensation schedules, and generated candidates remain private and unapproved.',
    },
  }).package;
}
