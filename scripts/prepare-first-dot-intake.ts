/** Prepare checksum-checked PRIVATE intake packages. No network, approvals or publication. */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIntake } from '../src/lib/intake-contract';
import { fundingStates } from '../src/lib/funding';
import { workSchema } from '../src/lib/validation';
import type { Work, SourceReceipt } from '../src/lib/model';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = path.join(root, 'data/acquisition/first-dots');
const out = path.join(base, 'intake');
const load = async (p: string) => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const curated = async (p: string) => JSON.parse(await readFile(path.join(base, p), 'utf8'));
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
type Original = {
  hash: string;
  url: string;
  file: string;
  retrievedAt: string;
  contentType: string;
  name: string;
  reuseBasis: string;
  bytes?: number;
};
type Upload = Original & {
  sourceId: string;
  storagePath: string;
  checksumVerified: true;
  withinPilotLimit: boolean;
};
const originals = new Map<string, Original>();
const allUploads = new Map<string, Upload>();
const manifests: Record<string, unknown>[] = [];

function register(meta: Record<string, any>, name: string, reuseBasis: string, url?: string) {
  const h = meta.sha256 ?? meta.hash;
  if (!h || !(meta.file ?? meta.original))
    throw new Error('Original needs its real source hash and local path.');
  originals.set(h, {
    hash: h,
    url: url ?? meta.url,
    file: meta.file ?? meta.original,
    retrievedAt: meta.retrievedAt,
    contentType:
      meta.contentType ??
      ((meta.file ?? meta.original).endsWith('.pdf')
        ? 'application/pdf'
        : (meta.file ?? meta.original).endsWith('.json')
          ? 'application/json'
          : 'text/html'),
    name,
    reuseBasis,
  });
}
function sourceFY(value: string) {
  const m = /^(\d{4})-(\d{2}|\d{4})$/.exec(value);
  if (!m) throw new Error('Source financial year is not explicit.');
  const end = m[2].length === 2 ? Number(m[1].slice(0, 2) + m[2]) : Number(m[2]);
  if (end !== Number(m[1]) + 1) throw new Error('Invalid source financial-year interval.');
  return `${m[1]}-${end}`;
}
function receiptRef(r: SourceReceipt) {
  return { hash: r.documentHash, url: r.url, locator: r.locator };
}
async function packageFor(
  work: Work,
  locationReceipt: SourceReceipt,
  geometry: Record<string, unknown> | null,
  contractId: string | null,
  extras: Original[],
  lineage: Record<string, unknown>,
  kind: string,
) {
  const state = fundingStates.find((s) => s.name === work.state);
  if (!state) throw new Error('Unknown jurisdiction.');
  // The publication RPC checks Work receipts, not private asset components.
  // Keep coordinate provenance inside the pending Work too, so its document
  // cannot silently escape the protected source-rights review.
  if (
    !work.stages.some((s) =>
      s.receipts.some(
        (r) => r.documentHash === locationReceipt.documentHash && r.url === locationReceipt.url,
      ),
    )
  ) {
    const stage = work.stages.find((s) => s.id === 'sanction')!;
    stage.receipts.push({
      ...locationReceipt,
      title: `Coordinate provenance only: ${locationReceipt.title}`,
    });
    stage.description +=
      ' Additional receipt supports only the linked source coordinate/archived route; it does not prove a sanction amount or an independently verified actual site.';
  }
  const receipts = [
    ...work.stages.flatMap((s) => s.receipts),
    ...(work.roles ?? []).map((r) => r.receipt),
    ...(work.authorityReceipt ? [work.authorityReceipt] : []),
    locationReceipt,
  ];
  const unique = new Map(receipts.map((r) => [r.documentHash, r]));
  const selected = [...new Set([...unique.keys(), ...extras.map((s) => s.hash)])];
  const uploads: Upload[] = [];
  const sources = [];
  for (const h of selected) {
    const o = originals.get(h);
    if (!o || !o.url) throw new Error(`Missing original metadata: ${h}`);
    if (unique.has(h) && unique.get(h)!.url !== o.url)
      throw new Error('Exact receipt/source URL mismatch.');
    const bytes = await readFile(path.join(root, o.file));
    if (hash(bytes) !== h) throw new Error(`Original checksum mismatch: ${o.file}`);
    const sourceId = `firstdot-${h.slice(0, 20)}`,
      storagePath = `${sourceId}/${h}`;
    const upload: Upload = {
      ...o,
      bytes: bytes.length,
      sourceId,
      storagePath,
      checksumVerified: true,
      withinPilotLimit: bytes.length <= 10 * 1024 * 1024,
    };
    uploads.push(upload);
    allUploads.set(h, upload);
    sources.push({
      id: sourceId,
      name: o.name,
      family: kind === 'road' ? 'public_road_evidence' : 'state_publicworks_evidence',
      hash: h,
      url: o.url,
      storagePath,
      contentType: o.contentType,
      retrievedAt: o.retrievedAt,
      reuseBasis: o.reuseBasis,
    });
  }
  const primary =
    work.stages.find((s) => s.id === 'award')?.receipts[0] ?? work.stages[0].receipts[0];
  const input = {
    version: 'hisaab-intake/1',
    batchId: `firstdot-${kind}-${work.id}-20261025`,
    jurisdiction: state.code,
    cutoff: '2026-10-25',
    sources,
    projects: [work],
    assets: [
      {
        id: `asset-${work.id}`,
        projectId: work.id,
        assetId: String(lineage.assetId ?? work.officialIds[0]),
        matchBasis: 'official_id',
        location: work.location,
        precision: 'source_point',
        geometry,
        sourceRefs: [receiptRef(primary), receiptRef(locationReceipt)],
      },
    ],
    contracts: contractId
      ? [
          {
            id: `contract-${work.id}`,
            projectId: work.id,
            contractId,
            contractorId: null,
            amountRupees: null,
            date: work.stages.find((s) => s.id === 'award')?.date ?? null,
            startDate: null,
            endDate: null,
            sourceRefs: [receiptRef(primary)],
          },
        ]
      : [],
    payments: [],
    allocations: [],
    parties: [],
    completion: [],
    funding: [],
    coverage: {
      denominator: null,
      denominatorSource: null,
      years: [work.financialYear],
      missing:
        kind === 'road'
          ? [
              'Explicit owner source/use and stage decisions are pending; factual claim investigation is attached separately.',
              'The map point supports an archived proposal route only; current actual road/site and current district boundary membership are unverified.',
              'No currency scale, paid amount, payment recipient, settlement or completion certificate is claimed.',
              'Financial year describes the source-reported sanction date only; original IMS_YEAR and project spending-year meaning remain separate.',
            ]
          : [
              'PPMS republication basis is unresolved: its own terms do not grant reuse; departmental policy does not explicitly extend to PPMS.',
              'The map point is an official project-linked photo coordinate, not a verified actual project site. No photos are included.',
              'Currency, payment allocations, recipient role/settlement and completion remain unestablished.',
              'The financial year is the source work-start label and may differ from approval-event financial years.',
            ],
      nextAction:
        'Review the attached source, geographic-precision and narrow-stage findings in the protected owner workflow. Upload originals, stage this package, then review supported facts individually. Never approve an unknown payment or completion.',
      checkpoint:
        'Original hashes rechecked locally. No original uploaded, batch staged, owner approval recorded or project published by this preparation.',
    },
  };
  const validated = validateIntake(input);
  const file = `${kind}-${state.code}-${work.id}.json`;
  const serialized = JSON.stringify(validated.package, null, 2) + '\n';
  if (Buffer.byteLength(serialized) > 2 * 1024 * 1024)
    throw new Error('Package exceeds pilot bound.');
  await writeFile(path.join(out, file), serialized);
  await writeFile(
    path.join(out, file.replace('.json', '.lineage.json')),
    JSON.stringify(
      {
        batchId: input.batchId,
        workId: work.id,
        kind,
        lineage,
        locationClaim: work.physicalVerification,
        sourceUploads: uploads,
        publicationApproved: false,
        staged: false,
      },
      null,
      2,
    ) + '\n',
  );
  const entry = {
    file,
    batchId: input.batchId,
    workId: work.id,
    title: work.title,
    state: work.state,
    areaId: work.areaId,
    kind,
    sourceCount: sources.length,
    packageBytes: Buffer.byteLength(serialized),
    allOriginalsWithinPilotLimit: uploads.every((s) => s.withinPilotLimit),
    sourceRightsStatus:
      kind === 'road'
        ? 'documented_narrow_text_and_archived_data_basis_owner_decision_pending'
        : 'unresolved_do_not_publish',
    sourceClaimsInvestigated: true,
    ownerApproval: false,
    staged: false,
    published: false,
  };
  manifests.push(entry);
}

async function main() {
  await mkdir(out, { recursive: true });
  const road = await curated('roads-work-candidates.json'),
    roadReview = await curated('roads-reviewed-claims.json');
  const geo = await curated('roads-evidence-limited-review.json');
  const recovery = await curated('roads-district-original-recovery.json');
  const policy = await curated('roads-originals/pmgsy-reuse-policy.json');
  const release = await curated('roads-originals/geography-license-release.json');
  const roadBasis = `Proposed narrow text/data reuse basis: official OMMAS copyright policy ${policy.url}, original SHA-256 ${policy.sha256}. Accurate attributed source facts only; date and no-endorsement notice required. No logos or photographs included. Explicit owner document-level decision still pending.`;
  const geoBasis = `Proposed archived GIS reuse basis: Government Open Data License India; official PIB release ${release.url}, SHA-256 ${release.sha256}, names DataMeet partnership. Preserve archive attribution/edition and third-party exclusions. Explicit owner source/use decision pending.`;
  register(
    policy,
    'Official OMMAS copyright policy',
    'Policy evidence retained for review; owner publication decision not recorded.',
  );
  register(
    release,
    'Official GeoSadak GIS release announcement',
    'Official PIB policy/GIS release context retained for owner review.',
  );
  for (const original of road.candidates) {
    const w = structuredClone(original),
      review = roadReview.records.find((r: any) => r.candidateId === w.id);
    if (!review) throw new Error('Road claim findings missing.');
    const packet = geo.packets.find((r: any) => r.candidateId === w.id);
    const fresh = recovery.requests.find(
      (r: any) => r.candidateId === w.id && r.status === 'preserved',
    );
    const source = fresh
      ? { ...fresh, original: fresh.file, contentType: 'application/json' }
      : await load(`data/acquisition/documents/${w.stages[0].receipts[0].documentHash}.json`);
    register(source, 'Official PMGSY road/tender report', roadBasis);
    if (fresh) {
      if (!fresh.sameAllFieldsAsPriorEdition)
        throw new Error('Fresh source edition must reconcile before use.');
      for (const stage of w.stages)
        for (const r of stage.receipts) {
          r.documentHash = fresh.sha256;
          r.url = fresh.url;
          r.retrievedAt = fresh.retrievedAt.slice(0, 10);
          r.locator = `District-filtered official JSON row ${fresh.exactRoadRow}; IMS_PR_ROAD_CODE ${packet.officialRoadId}; StateID ${fresh.query.StateID}; DistrictID ${fresh.query.DistrictID}`;
        }
    }
    register(
      { ...packet.geographySource, contentType: 'application/zip' },
      'Archived GeoSadak proposal route via DataMeet',
      geoBasis,
    );
    const calendar = review.checks.financialYear.calendarDefinitionSource;
    register(
      calendar,
      'Official financial-year calendar definition',
      'Official DEA calendar definition used only to describe the financial year containing a dated sanction event; owner source review pending.',
    );
    const rawState = w.state;
    if (w.state === 'Keralam') w.state = 'Kerala';
    w.financialYear = review.checks.financialYear.sanctionEventFinancialYear;
    w.summary = `${review.minimalAccurateCard.notice} Financial year shown is the year containing the source-reported sanction date, not project spending. Source state label: ${rawState}.`;
    w.money = [];
    for (const s of w.stages) {
      s.amount = null;
      s.reviewStatus = 'pending';
      if (s.receipts.length)
        s.description =
          s.id === 'sanction'
            ? 'Official report supplies this sanction date; no sanction amount or original sanction order claimed.'
            : 'Official report supplies an agreement reference and date; no contract amount, contractor or payment claimed.';
    }
    await packageFor(
      workSchema.parse(w),
      w.geographyReceipt,
      packet.geometry,
      packet.sourceReportedAgreementReference,
      [
        originals.get(policy.sha256)!,
        originals.get(release.sha256)!,
        originals.get(calendar.sha256)!,
      ],
      {
        assetId: w.assetId,
        rawSourceState: rawState,
        rawSourceYear: w.review.raw.IMS_YEAR,
        financialYearBasis: review.checks.financialYear,
        districtAssociation: w.review.districtAssociationBasis,
        sourceQuery: source.query,
        sourceClaimFindings: 'data/acquisition/first-dots/roads-reviewed-claims.json',
      },
      'road',
    );
  }
  const odisha = await curated('odisha-proposed-works-2026-10-25.json');
  const op = await curated('odisha-source-evidenced-project-review-2026-10-25.json');
  const odReview = await curated('odisha-reviewed-claims.json');
  const ppmsBasis =
    'UNRESOLVED: PPMS itself provides no verified reproduction licence. Main departmental policy has conflicting prior-permission and CC BY wording without explicit PPMS scope. This package is for private evidence review only; no public photos, payment claims or source-rights approval.';
  for (const row of odisha.candidates) {
    const w = structuredClone(row.work),
      packet = op.shortlist.find((p: any) => p.projectCode === w.officialIds[0]);
    const claims = odReview.records.find((r: any) => r.projectCode === w.officialIds[0]);
    if (!packet || !claims) throw new Error('Odisha claim findings missing.');
    for (const p of packet.projectSources) register(p, 'Official PPMS project register', ppmsBasis);
    register(packet.photoLocationSource, 'Official PPMS project-linked photo metadata', ppmsBasis);
    for (const bill of packet.supportingBillDocuments)
      register(
        { ...bill.source, url: bill.officialDownloadUrl },
        'Official PPMS supporting bill document (private only)',
        ppmsBasis,
      );
    const patch = claims.suggestedWorkPatch;
    const newReceipt = patch.authorityReceipt;
    const liveFile = path.join(base, `odisha-live-${newReceipt.documentHash}.html`);
    await stat(liveFile);
    register(
      {
        sha256: newReceipt.documentHash,
        url: newReceipt.url,
        file: path.relative(root, liveFile),
        retrievedAt: odReview.reviewedAt,
      },
      'Fresh official PPMS execution-level source',
      ppmsBasis,
    );
    w.authority = patch.authority;
    w.authorityReceipt = newReceipt;
    w.financialYear = sourceFY(w.financialYear);
    w.summary +=
      ' Financial year is the source work-start year, not an inferred payment or approval year. Source-reported execution level: Panchayat Samiti, Balangir.';
    await packageFor(
      workSchema.parse(w),
      row.locationReceipt,
      { type: 'Point', coordinates: w.location },
      null,
      [],
      {
        sourceWorkStartFinancialYear: packet.sourceWorkStartFinancialYear,
        financialYearBasis:
          'Expanded source work-start fiscal-year label, not inferred from approval dates.',
        sourceClaimFindings: 'data/acquisition/first-dots/odisha-reviewed-claims.json',
        photoRightsApproved: false,
        sourcePhotographsIncluded: false,
      },
      'odisha',
    );
  }
  const uploads = [...allUploads.values()];
  const summary = {
    preparedAt: new Date().toISOString(),
    scope:
      'Validated private first-dot intake only; no automatic evidence/source approvals or network writes.',
    packages: manifests.length,
    projects: manifests.length,
    districts: new Set(manifests.map((r) => r.areaId)).size,
    roadProjects: manifests.filter((r) => r.kind === 'road').length,
    odishaProjects: manifests.filter((r) => r.kind === 'odisha').length,
    distinctOriginals: uploads.length,
    totalOriginalBytes: uploads.reduce((n, r) => n + (r.bytes ?? 0), 0),
    oversizeOriginals: uploads.filter((r) => !r.withinPilotLimit).length,
    sourceRightsUnresolvedProjects: manifests.filter((r) => r.kind === 'odisha').length,
    ownerApprovals: 0,
    stagedProjects: 0,
    publishedProjects: 0,
    batches: manifests,
    originals: uploads,
    checkpoints: [
      'All strict package validations passed.',
      'All referenced original bytes rehashed.',
      'Five oversized source originals replaced with independently retrieved official district reports; exact rows reconciled.',
      'Remote staging requires a working hosted endpoint and owner MFA; none attempted.',
    ],
  };
  await writeFile(path.join(base, 'intake-manifest.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ ...summary, batches: undefined, originals: undefined }, null, 2));
}
await main();
