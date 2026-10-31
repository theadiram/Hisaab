import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
process.loadEnvFile('.env.local');
if (new URL(process.env.SUPABASE_URL).hostname !== '127.0.0.1')
  throw new Error('Disposable local database required');
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  }),
  owner = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  }),
  anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
const seed = randomBytes(8).toString('hex'),
  hash = randomBytes(32).toString('hex'),
  password = randomBytes(20).toString('hex'),
  source = 'funding-test-' + seed;
function sql(s) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_Hisaab',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    { input: s, encoding: 'utf8', stdio: 'pipe' },
  ).trim();
}
function assert(v, m) {
  if (!v) throw new Error(m);
}
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))),
    counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', key).update(counter).digest(),
    offset = h[19] & 15;
  return String((h.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
// Keep the locally tested validator equal to the final migration before hosted execution.
const validation = readFileSync(
  'supabase/migrations/20261009193000_funding_payload_types.sql',
  'utf8',
).split('revoke all')[0];
sql(validation);
const made = await service.auth.admin.createUser({
  email: `funding-${seed}@example.invalid`,
  password,
  email_confirm: true,
});
if (made.error) throw made.error;
const uid = made.data.user.id;
const fixture = {
  id: source + ':fact',
  identity: source,
  edition: 'Disposable test edition',
  financialYear: '2026-2027',
  programmeId: source,
  programme: 'Disposable test fund',
  budgetHead: 'TEST',
  ministry: 'Test only',
  jurisdiction: '10',
  jurisdictionLabel: 'Bihar',
  purpose: 'disaster_response',
  channel: 'disaster_grant',
  instrument: 'grant',
  measure: 'allocated',
  estimate: 'original',
  accountingBasis: 'union_budget',
  share: 'union',
  amountRupees: '100.10',
  periodStart: '2026-04-01',
  periodEnd: '2027-03-31',
  cutoff: '2026-02-01',
  publicationDate: '2026-02-01',
  coverageKey: source,
  aggregation: 'leaf',
  parentKey: null,
  classification: 'awaiting_review',
  conflict: false,
  source: {
    hash,
    url: 'https://www.indiabudget.gov.in/disposable-test.pdf',
    locator: 'Disposable fixture, page 1',
    retrievedAt: '2026-10-09T10:00:00Z',
    page: 1,
  },
  notes: 'Disposable accounting test. Not actual government funding.',
};
const stage = (rs) => service.rpc('stage_funding', { p_records: rs }),
  reason = 'Disposable test evidence was checked explicitly; this is not a real publication.',
  decision = {
    classification: 'included',
    action: 'publish',
    confirmed: true,
    sourceChecked: true,
    unitsChecked: true,
    jurisdictionChecked: true,
    scopeChecked: true,
    editionsChecked: true,
  };
const review = (id, d = decision) =>
  owner.rpc('review_funding', { p_id: id, p_decision: d, p_reason: reason });
try {
  sql(
    `insert into private.admin_members(user_id) values('${uid}');insert into public.sources(id,name,official_url,family,access_method) values('${source}','Disposable funding','https://example.invalid','test','test');insert into private.source_documents(source_id,original_url,sha256,storage_path,content_type,query_manifest) values('${source}','https://www.indiabudget.gov.in/disposable-test.pdf','${hash}','test/funding','application/pdf','{"retrievedAt":"2026-10-09T10:00:00Z"}');`,
  );
  for (const bad of [
    { ...fixture, amountRupees: 100 },
    { ...fixture, programme: null },
    { ...fixture, cutoff: null },
    { ...fixture, purpose: null },
    { ...fixture, jurisdiction: '99' },
    { ...fixture, bankAccount: 'private' },
    { ...fixture, amountRupees: '100.001' },
    { ...fixture, source: { ...fixture.source, hash: 'a'.repeat(64) } },
    { ...fixture, measure: 'released' },
  ])
    assert((await stage([bad])).error, 'Invalid funding evidence accepted');
  assert((await stage([fixture])).data === 1, 'First private stage failed');
  assert((await stage([fixture])).data === 0, 'Import not idempotent');
  assert((await stage([{ ...fixture, amountRupees: '200.00' }])).error, 'Immutable fact changed');
  assert(
    (await anon.rpc('admin_funding', { p_year: '2026-2027' })).error,
    'Anonymous private queue read',
  );
  assert((await anon.rpc('stage_funding', { p_records: [] })).error, 'Anonymous staging');
  let login = await owner.auth.signInWithPassword({ email: made.data.user.email, password });
  if (login.error) throw login.error;
  assert(
    (await owner.rpc('admin_funding', { p_year: '2026-2027' })).error,
    'Password-only funding access',
  );
  const factor = await owner.auth.mfa.enroll({ factorType: 'totp' });
  if (factor.error) throw factor.error;
  const verified = await owner.auth.mfa.challengeAndVerify({
    factorId: factor.data.id,
    code: totp(factor.data.totp.secret),
  });
  if (verified.error) throw verified.error;
  const page = await owner.rpc('admin_funding', {
    p_year: '2026-2027',
    p_query: 'Disposable test fund',
  });
  if (page.error) throw page.error;
  const record = page.data.records.find((r) => r.id === fixture.id);
  assert(record && !record.permissionReviewed, 'Source permission inferred');
  assert((await review(fixture.id)).error, 'Publication without rights accepted');
  const permission = await owner.rpc('verify_source_permission', {
    p_document: record.documentId,
    p_basis: 'Disposable local fixture: no third-party contents or external publication.',
    p_evidence: 'Test fixture defined within this local test only.',
  });
  if (permission.error) throw permission.error;
  assert(
    (await review(fixture.id, { ...decision, unitsChecked: false })).error,
    'Publication without unit check',
  );
  for (const change of [
    { share: 'combined' },
    { conflict: true },
    { amountRupees: null },
    { aggregation: 'context' },
    { instrument: 'unresolved' },
  ]) {
    const r = { ...fixture, ...change, id: source + ':bad:' + Object.keys(change)[0] };
    await stage([r]);
    assert((await review(r.id)).error, 'Ambiguous record published');
  }
  // A budget-row draft uses only the preserved column, stays national and remains private.
  const rowId = hash + ':1:1',
    row = {
      id: rowId,
      sourceHash: hash,
      sourceUrl: fixture.source.url,
      edition: '2026-2027',
      rawText: 'Disposable source row: explicit programme amount',
      page: 1,
      line: 1,
      demandNumber: 1,
    };
  assert(
    (
      await service.rpc('stage_funding_inventory', {
        p_hash: hash,
        p_year: '2026-2027',
        p_rows: [row],
      })
    ).data === 1,
    'Budget inventory fixture failed',
  );
  const interpretation = {
    rowId,
    parserVersion: 'disposable-columns',
    edition: '2026-2027',
    interpretation: {
      sourceUnit: 'crore',
      columns: [
        { measure: 'actual', financialYear: '2024-2025', totalRupees: '70.10' },
        { measure: 'budget_estimate', financialYear: '2025-2026', totalRupees: '80.10' },
        { measure: 'revised_estimate', financialYear: '2025-2026', totalRupees: '90.10' },
        { measure: 'budget_estimate', financialYear: '2026-2027', totalRupees: '12345678.90' },
      ],
    },
  };
  assert(
    (await service.rpc('stage_funding_interpretations', { p_rows: [interpretation] })).data === 1,
    'Budget interpretation fixture failed',
  );
  const metadata = {
    programmeId: source,
    programme: 'Disposable explicit budget programme',
    budgetHead: 'TEST',
    ministry: 'Test only',
    channel: 'central_sector',
    instrument: 'direct_expenditure',
    coverageKey: source + ':budget',
    parentKey: null,
    aggregation: 'leaf',
    cutoff: '2026-02-01',
    publicationDate: '2026-02-01',
    confirmed: true,
  };
  const draft = (metadataOverride = metadata, column = 3) =>
    owner.rpc('draft_budget_funding', {
      p_row_id: rowId,
      p_parser_version: 'disposable-columns',
      p_column: column,
      p_metadata: metadataOverride,
      p_reason: reason,
    });
  assert(
    (
      await anon.rpc('draft_budget_funding', {
        p_row_id: rowId,
        p_parser_version: 'disposable-columns',
        p_column: 3,
        p_metadata: metadata,
        p_reason: reason,
      })
    ).error,
    'Anonymous budget draft accepted',
  );
  assert((await draft()).error, 'Unclassified row became a fact');
  assert(
    !(
      await owner.rpc('review_funding_inventory', {
        p_id: rowId,
        p_classification: 'included',
        p_purpose: 'education',
        p_reason: reason,
      })
    ).error,
    'Private inventory classification failed',
  );
  assert((await draft({ ...metadata, programme: null })).error, 'Null programme accepted');
  assert(
    (await draft({ ...metadata, bankAccount: 'private' })).error,
    'Sensitive metadata accepted',
  );
  assert(
    (await draft({ ...metadata, cutoff: '2024-02-01' }, 0)).error,
    'Actuals accepted with pre-period cutoff',
  );
  const draftResult = await draft();
  if (draftResult.error) throw draftResult.error;
  assert((await draft()).data === draftResult.data, 'Budget draft not idempotent');
  const budgetPage = await owner.rpc('admin_funding', {
    p_year: '2026-2027',
    p_query: 'Disposable explicit budget programme',
  });
  const budgetFact = budgetPage.data.records.find((r) => r.id === draftResult.data);
  assert(
    budgetFact?.amountRupees === '12345678.90' &&
      budgetFact.jurisdiction === 'national' &&
      budgetFact.classification === 'awaiting_review' &&
      !budgetFact.published,
    'Budget draft altered amount/scope or auto-approved',
  );
  assert(
    !(await anon.rpc('funding_records', { p_year: '2026-2027', p_measure: 'allocated' })).data.some(
      (r) => r.id === draftResult.data,
    ),
    'Private budget draft became public',
  );
  let immutable = false;
  try {
    sql(
      `update private.funding_budget_lines set payload=payload||'{"rawText":"changed"}'::jsonb where id='${rowId}';`,
    );
  } catch {
    immutable = true;
  }
  assert(immutable, 'Original budget row could be rewritten');
  const pub = await review(fixture.id);
  if (pub.error) throw pub.error;
  const publicRows = await anon.rpc('funding_records', {
    p_year: '2026-2027',
    p_measure: 'allocated',
  });
  assert(
    publicRows.data.some((r) => r.id === fixture.id && r.amountRupees === '100.10'),
    'Reviewed public snapshot missing',
  );
  const duplicate = { ...fixture, id: source + ':mirror', edition: 'Second original' };
  await stage([duplicate]);
  assert((await review(duplicate.id)).error, 'Overlapping source mirror published');
  const revision = {
    ...fixture,
    id: source + ':revision',
    estimate: 'revised',
    amountRupees: '200.00',
  };
  await stage([revision]);
  assert(!(await review(revision.id)).error, 'Separate revised-estimate alternative rejected');
  assert(
    !(await review(draftResult.data)).error,
    'Explicit reviewed budget draft could not publish',
  );
  assert(
    !(
      await owner.rpc('review_funding_inventory', {
        p_id: rowId,
        p_classification: 'excluded',
        p_purpose: 'education',
        p_reason: reason,
      })
    ).error,
    'Budget row re-review failed',
  );
  assert(
    !(await anon.rpc('funding_records', { p_year: '2026-2027', p_measure: 'allocated' })).data.some(
      (r) => r.id === draftResult.data,
    ),
    'Budget reclassification left amount public',
  );
  assert((await review(draftResult.data)).error, 'Excluded original row republished');
  const withdrawal = await owner.rpc('withdraw_funding_source', {
    p_document: record.documentId,
    p_reason: reason,
  });
  if (withdrawal.error) throw withdrawal.error;
  assert(
    !(await anon.rpc('funding_records', { p_year: '2026-2027', p_measure: 'allocated' })).data.some(
      (r) => r.id.startsWith(source),
    ),
    'Source withdrawal left amounts public',
  );
  sql(`update private.admin_members set enabled=false where user_id='${uid}';`);
  assert(
    (await owner.rpc('admin_funding', { p_year: '2026-2027' })).error,
    'Revoked owner retained access',
  );
  console.log(
    'PASS: immutable/idempotent funding, exact payload validation, source rights, explicit MFA checks, share/conflict/unknown rejection, overlap rejection, revised alternatives, withdrawal and revoked-owner denial',
  );
} finally {
  await owner.auth.signOut();
  // This named local test owns every deleted fixture. Preserve production and other local data.
  sql(
    `begin;alter table private.funding_budget_drafts disable trigger immutable_funding_budget_link;delete from private.funding_budget_drafts where row_id like '${hash}%';alter table private.funding_budget_drafts enable trigger immutable_funding_budget_link;delete from private.funding_publications where record_id in(select id from private.funding_records where document_id in(select id from private.source_documents where sha256='${hash}'));delete from private.funding_decisions where record_id in(select id from private.funding_records where document_id in(select id from private.source_documents where sha256='${hash}'));alter table private.funding_records disable trigger immutable_funding_records;delete from private.funding_records where document_id in(select id from private.source_documents where sha256='${hash}');alter table private.funding_records enable trigger immutable_funding_records;alter table private.funding_budget_interpretations disable trigger immutable_funding_interpretation;delete from private.funding_budget_interpretations where row_id like '${hash}%';alter table private.funding_budget_interpretations enable trigger immutable_funding_interpretation;alter table private.funding_budget_lines disable trigger immutable_funding_inventory_original;delete from private.funding_budget_lines where id like '${hash}%';alter table private.funding_budget_lines enable trigger immutable_funding_inventory_original;delete from private.source_permission_reviews where document_id in(select id from private.source_documents where sha256='${hash}');delete from private.source_documents where sha256='${hash}';delete from private.audit_events where actor='${uid}';delete from private.admin_members where user_id='${uid}';delete from public.sources where id='${source}';commit;`,
  );
  await service.auth.admin.deleteUser(uid);
}
