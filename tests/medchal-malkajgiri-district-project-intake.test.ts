import { describe, expect, it } from 'vitest';
import { prepareMedchalMalkajgiriDistrictProjectIntake } from '../src/lib/medchal-malkajgiri-district-project-intake';

const sources = [
  {
    sourceId: 'medchal-madharam-industrial-park-form-c-2024',
    url: 'https://cdn.s3waas.gov.in/s3da4fb5c6e93e74d3df8527599fa62642/uploads/2024/12/2024122148.pdf',
    sha256: '3ef1e15be573f1fd7f040c0741178191f19f1cd40262c5579638a8599de7c171',
    projectId: 'Madharam Industrial Park',
    title: 'Madharam Industrial Park',
    purpose: 'industry',
    stage: 'preliminary_land_acquisition_notification',
    date: '2024-12-06',
    year: '2024-2025',
    ids: ['Gazette MMD-11', 'B/107/2024', 'G2/1992/2024'],
  },
  {
    sourceId: 'medchal-kaleshwaram-ravalkola-link-form-c-2021',
    url: 'https://cdn.s3waas.gov.in/s3da4fb5c6e93e74d3df8527599fa62642/uploads/2022/06/2022062539.pdf',
    sha256: '7baefba9d73f9f6e3840f69385de8a2ab5e75ccf71b5784b85c8acb48334eeed',
    projectId: 'Kaleshwaram Ravalkola Link Canal System',
    title: 'Kaleshwaram Ravalkola Link Canal System',
    purpose: 'irrigation',
    stage: 'preliminary_land_acquisition_notification',
    date: '2021-10-07',
    year: '2021-2022',
    ids: ['Gazette MMD-6', 'D/614/2021'],
  },
  {
    sourceId: 'medchal-lothukunta-sh01-corridor-award-2026',
    url: 'https://cdn.s3waas.gov.in/s3da4fb5c6e93e74d3df8527599fa62642/uploads/2026/04/17751199075970.pdf',
    sha256: '7bf3670fda0db5e4d967f7f608f9ce5b7b4878450f85bfd7e1883113e60aca8e',
    projectId: 'Paradise-Shamirpet SH-01 corridor: Lothukunta award',
    title: 'Paradise-Shamirpet SH-01 corridor at Lothukunta',
    purpose: 'transport',
    stage: 'land_acquisition_award',
    date: '2026-03-28',
    year: '2025-2026',
    ids: ['C/97/2024/lothukunta', 'G2/781/2024', 'Gazette MMD-08'],
  },
];

function fixture() {
  const retrievedAt = '2026-11-21T07:35:00.000000+00:00';
  return {
    candidates: {
      version: 'state-development-candidates/1',
      stateCode: '36',
      projectCandidates: sources.map((source) => ({
        id: `${source.sha256}:p1:project-header`,
        stateCode: '36',
        financialYear: source.year,
        district: 'Medchal-Malkajgiri',
        districtAreaId: 'medchal-malkajgiri-district',
        title: source.title,
        sourceProjectId: source.projectId,
        officialIds: source.ids,
        projectIdBasis: 'official_gazette_or_notice_identifiers',
        purpose: source.purpose,
        stage: source.stage,
        stageDate: source.date,
        stageDateBasis: 'printed_notice_gazette_or_proceedings_date',
        publishingAuthority: 'District Collector, Medchal-Malkajgiri',
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
        notes: 'Synthetic project header; affected-party and compensation schedules are excluded.',
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

describe('Medchal-Malkajgiri District project intake preparation', () => {
  it('produces three project-header records without personal or financial data', () => {
    const input = fixture();
    const batch = prepareMedchalMalkajgiriDistrictProjectIntake(input.candidates, input.checkpoint);
    expect(batch.version).toBe('hisaab-intake/1');
    expect(batch.sources).toHaveLength(3);
    expect(batch.projects).toHaveLength(3);
    expect(batch.projects.every((project) => project.district === 'Medchal-Malkajgiri')).toBe(true);
    expect(batch.projects.every((project) => project.location === null)).toBe(true);
    expect(batch.projects.every((project) => project.money.length === 0)).toBe(true);
    expect(batch.projects.every((project) => project.stages.length === 4)).toBe(true);
    expect(batch.funding).toEqual([]);
    expect(batch.payments).toEqual([]);
    expect(JSON.stringify(batch)).not.toContain('affected person');
    expect(batch.parties).toEqual([]);
  });

  it('rejects changed source identity and incomplete project sets', () => {
    const changed = fixture();
    changed.checkpoint.documents[0].sha256 = 'a'.repeat(64);
    expect(() =>
      prepareMedchalMalkajgiriDistrictProjectIntake(changed.candidates, changed.checkpoint),
    ).toThrow();

    const incomplete = fixture();
    incomplete.candidates.projectCandidates.pop();
    expect(() =>
      prepareMedchalMalkajgiriDistrictProjectIntake(incomplete.candidates, incomplete.checkpoint),
    ).toThrow('Expected one bounded project from each Medchal-Malkajgiri notice');
  });
});
