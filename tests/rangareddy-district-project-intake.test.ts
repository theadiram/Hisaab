import { describe, expect, it } from 'vitest';
import { prepareRangareddyDistrictProjectIntake } from '../src/lib/rangareddy-district-project-intake';

const sources = [
  {
    sourceId: 'rangareddy-himayathsagar-dargah-khaliz-khan-form-vii-2026',
    url: 'https://cdn.s3waas.gov.in/s3addfa9b7e234254d26e9c7f2af1005cb/uploads/2026/09/17907615122374.pdf',
    sha256: '12f51f19751c7cc6afcff08c52fd2416147611e6e05b9f190bb262924b651dd5',
    projectId: 'Himayathsagar Bund Improvement & Eco Project',
    title: 'Himayathsagar Bund Improvement and Eco Project',
    purpose: 'environment',
    stage: 'land_acquisition_public_declaration',
    date: '2026-07-13',
    year: '2026-2027',
    ids: ['Gazette No.110', 'I/LA/2395/2025-2'],
  },
  {
    sourceId: 'rangareddy-greenfield-radial-road-form-vii-2026',
    url: 'https://cdn.s3waas.gov.in/s3addfa9b7e234254d26e9c7f2af1005cb/uploads/2026/09/17904122296078.pdf',
    sha256: '5ebbda57de7c60ef4e94b70b25bab46dd50e3e45de0b1871460c2baee3764560',
    projectId: 'Greenfield Radial Road Phase I: Raviryal-Meerkhanpet',
    title: 'Greenfield Radial Road Phase I',
    purpose: 'transport',
    stage: 'land_acquisition_form_vii_publication_request',
    date: '2026-09-17',
    year: '2026-2027',
    ids: ['Lr.No.G2/145/2026', 'Form VII 17-09-2026'],
  },
  {
    sourceId: 'rangareddy-mamidipally-airport-road-form-c-2025',
    url: 'https://cdn.s3waas.gov.in/s3addfa9b7e234254d26e9c7f2af1005cb/uploads/2025/12/17654502528703.pdf',
    sha256: 'ce9b2711a577ecfed9f3d5787ed3cab9c7b4d20d3456149cc7fdac89fa8d946e',
    projectId: 'Mamidipally external road to airport boundary',
    title: 'Mamidipally external road to airport boundary',
    purpose: 'transport',
    stage: 'preliminary_land_acquisition_notification',
    date: '2025-10-11',
    year: '2025-2026',
    ids: ['Gazette RR No.30', 'C/33/2023'],
  },
];

function fixture() {
  const retrievedAt = '2026-11-21T02:12:07.983966+00:00';
  return {
    candidates: {
      version: 'state-development-candidates/1',
      stateCode: '36',
      projectCandidates: sources.map((source) => ({
        id: `${source.sha256}:p1:project-header`,
        stateCode: '36',
        financialYear: source.year,
        district: 'Rangareddy',
        districtAreaId: 'rangareddy-district',
        title: source.title,
        sourceProjectId: source.projectId,
        officialIds: source.ids,
        projectIdBasis: 'official_gazette_or_notice_identifiers',
        purpose: source.purpose,
        stage: source.stage,
        stageDate: source.date,
        stageDateBasis: 'printed_notice_or_gazette_date',
        publishingAuthority: 'District Collector, Rangareddy',
        mandals: ['Example Mandal'],
        villages: ['Example Village'],
        sourceExtent: 'Source-reported extent',
        location: null,
        locationPrecision: 'district',
        projectCostRupees: null,
        contractAmountRupees: null,
        paymentAmountRupees: null,
        completionDate: null,
        sourceDocumentContainsAffectedPartyRecords: true,
        reviewStatus: 'awaiting_review',
        publicationApproved: false,
        source: {
          url: source.url,
          sha256: source.sha256,
          retrievedAt,
          locator: 'Original PDF page 1 project header only',
          publicationDate: source.date,
        },
        notes: 'Synthetic project header; affected-party schedules are excluded.',
      })),
    },
    checkpoint: {
      code: '36',
      documents: sources.map((source) => ({
        sourceId: source.sourceId,
        url: source.url,
        sha256: source.sha256,
        retrievedAt,
        contentType: 'application/pdf',
        permissionStatus: 'review_pending',
        publication: 'private_only',
        publicationDate: source.date,
        bytes: 1_000_000,
      })),
    },
  };
}

describe('Rangareddy District project intake preparation', () => {
  it('produces three project-header records without personal or financial data', () => {
    const input = fixture();
    const batch = prepareRangareddyDistrictProjectIntake(input.candidates, input.checkpoint);
    expect(batch.version).toBe('hisaab-intake/1');
    expect(batch.sources).toHaveLength(3);
    expect(batch.projects).toHaveLength(3);
    expect(batch.projects.every((project) => project.district === 'Rangareddy')).toBe(true);
    expect(batch.projects.every((project) => project.location === null)).toBe(true);
    expect(batch.projects.every((project) => project.money.length === 0)).toBe(true);
    expect(batch.projects.every((project) => project.stages.length === 4)).toBe(true);
    expect(batch.funding).toEqual([]);
    expect(batch.payments).toEqual([]);
    expect(JSON.stringify(batch)).not.toContain('affected person');
  });

  it('rejects changed source identity and incomplete project sets', () => {
    const changed = fixture();
    changed.checkpoint.documents[0].sha256 = 'a'.repeat(64);
    expect(() =>
      prepareRangareddyDistrictProjectIntake(changed.candidates, changed.checkpoint),
    ).toThrow();

    const incomplete = fixture();
    incomplete.candidates.projectCandidates.pop();
    expect(() =>
      prepareRangareddyDistrictProjectIntake(incomplete.candidates, incomplete.checkpoint),
    ).toThrow('Expected one bounded project from each Rangareddy notice');
  });
});
