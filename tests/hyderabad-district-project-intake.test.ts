import { describe, expect, it } from 'vitest';
import { prepareHyderabadDistrictProjectIntake } from '../src/lib/hyderabad-district-project-intake';

const sources = [
  {
    sourceId: 'hyderabad-district-gandhi-sarovar-land-acquisition-2026',
    url: 'https://hyderabad.telangana.gov.in/notice/land-acquisition-hyderabad-district-langer-house-and-quila-mohd-nagar-villages-of-golconda-mandal-musi-riverfront-development-corporation-limited-mrdcl-gandhi-sarovar-project-as/',
    sha256: 'cb9e669c3ee6eecfe24e0e6e00f0d2282c0a5eb78baa403c8696f9e1236bfe2b',
    projectId: 'MRDCL Gandhi Sarovar Project',
    title: 'Gandhi Sarovar Project as part of the Musi Riverfront Development Project',
    purpose: 'infrastructure',
    stage: 'preliminary_land_acquisition_notification',
    date: '2026-08-13',
    ids: ['MRDCL Gandhi Sarovar Project', 'Form VI 13-08-2026'],
  },
  {
    sourceId: 'hyderabad-district-sh01-land-acquisition-2026',
    url: 'https://hyderabad.telangana.gov.in/notice/land-acquisition-hyderabad-district-tirumalagiri-mandal-thokatta-kakagudatirumalagirimachabollaram-villages-elevated-corridor-from-paradise-junction-to-shamirpet-at-orr-junction-on-rajiv-ra-3/',
    sha256: 'eb91dfc7f76d08c37c7d204fe2246a9221bd3c63127dfbf131557fc936cf4bac',
    projectId: 'SH-01',
    title: 'Elevated Corridor from Paradise Junction to Shameerpet at ORR Junction on SH-01',
    purpose: 'transport',
    stage: 'land_acquisition_public_declaration',
    date: '2026-08-04',
    ids: ['SH-01', 'Public Declarations 30-37'],
  },
  {
    sourceId: 'hyderabad-district-nh44-land-acquisition-2026',
    url: 'https://hyderabad.telangana.gov.in/notice/land-acquisition-publication-of-declaration-gazette-no-234567-has-been-approved-by-the-district-collector-hyderabad-for-construction-of-elevated-corridor-from-paradise-junction-to-bowenpally-d/',
    sha256: 'c6849788f9870a3fe5b26f0192c57b4231fc7a0d6eca11225498867c85411551',
    projectId: 'NH-44',
    title: 'Elevated Corridor from Paradise Junction to Bowenpally Dairy Farm Road on NH-44',
    purpose: 'transport',
    stage: 'land_acquisition_public_declaration',
    date: '2026-05-20',
    ids: ['NH-44', 'Gazette Nos. 2-7'],
  },
];

function fixture() {
  const retrievedAt = '2026-11-21T02:04:11.495204+00:00';
  return {
    candidates: {
      version: 'state-development-candidates/1',
      stateCode: '36',
      projectCandidates: sources.map((source) => ({
        id: `${source.sha256}:table1:project`,
        stateCode: '36',
        financialYear: '2026-2027',
        district: 'Hyderabad',
        districtAreaId: 'hyderabad-district',
        title: source.title,
        sourceProjectId: source.projectId,
        officialIds: source.ids,
        projectIdBasis: 'official_project_route_and_notice_labels',
        purpose: source.purpose,
        stage: source.stage,
        stageDate: source.date,
        stageDateBasis: 'district_notice_start_date',
        publishingAuthority: 'District Collector, Hyderabad',
        implementingAgency: null,
        mandals: ['Example Mandal'],
        villages: ['Example Village 1', 'Example Village 2'],
        location: null,
        locationPrecision: 'district',
        projectCostRupees: null,
        contractAmountRupees: null,
        paymentAmountRupees: null,
        completionDate: null,
        linkedNoticeDocumentCount: 1,
        reviewStatus: 'awaiting_review',
        publicationApproved: false,
        source: {
          url: source.url,
          sha256: source.sha256,
          retrievedAt,
          locator: 'Official Hyderabad District notice table 1, row 1',
          publishingAuthority: 'District Collector, Hyderabad',
          publicationDate: source.date,
        },
        notes: 'Synthetic district land-acquisition notice; no financial stage is established.',
      })),
    },
    checkpoint: {
      code: '36',
      documents: sources.map((source) => ({
        sourceId: source.sourceId,
        url: source.url,
        sha256: source.sha256,
        retrievedAt,
        contentType: 'text/html',
        permissionStatus: 'review_pending',
        publication: 'private_only',
        bytes: 125_000,
      })),
    },
  };
}

describe('Hyderabad District project intake preparation', () => {
  it('produces three evidence-limited projects with no money or map pins', () => {
    const input = fixture();
    const batch = prepareHyderabadDistrictProjectIntake(input.candidates, input.checkpoint);
    expect(batch.version).toBe('hisaab-intake/1');
    expect(batch.sources).toHaveLength(3);
    expect(batch.projects).toHaveLength(3);
    expect(batch.projects.every((project) => project.district === 'Hyderabad')).toBe(true);
    expect(batch.projects.every((project) => project.location === null)).toBe(true);
    expect(batch.projects.every((project) => project.money.length === 0)).toBe(true);
    expect(batch.projects.every((project) => project.stages.length === 4)).toBe(true);
    expect(batch.funding).toEqual([]);
    expect(batch.payments).toEqual([]);
  });

  it('rejects changed source identity and incomplete project sets', () => {
    const changed = fixture();
    changed.checkpoint.documents[0].sha256 = 'a'.repeat(64);
    expect(() =>
      prepareHyderabadDistrictProjectIntake(changed.candidates, changed.checkpoint),
    ).toThrow();

    const incomplete = fixture();
    incomplete.candidates.projectCandidates.pop();
    expect(() =>
      prepareHyderabadDistrictProjectIntake(incomplete.candidates, incomplete.checkpoint),
    ).toThrow('Expected one bounded project from each Hyderabad District notice');
  });
});
