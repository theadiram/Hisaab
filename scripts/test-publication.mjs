import { localTestDatabaseContainer } from './local-test-database.mjs';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
process.loadEnvFile('.env.local');
if (new URL(process.env.SUPABASE_URL).hostname !== '127.0.0.1')
  throw new Error('Disposable local database required');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  }),
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  }),
  anonymous = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
const seed = randomBytes(8).toString('hex'),
  source = `test-${seed}`,
  area = `district:test-${seed}`,
  candidate = `test-work-${seed}`,
  email = `publication-${seed}@example.invalid`,
  password = randomBytes(20).toString('hex');
function sql(value) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      localTestDatabaseContainer(),
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    { input: value, encoding: 'utf8' },
  ).trim();
}
function code(secret) {
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
function assert(value, message) {
  if (!value) throw new Error(message);
}
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) throw created.error;
const user = created.data.user.id;
try {
  sql(
    `insert into private.admin_members(user_id) values('${user}');insert into public.areas(id,code,kind,name,approved) values('${area}','${seed}','district','Disposable district',false);`,
  );
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const factor = await client.auth.mfa.enroll({ factorType: 'totp' });
  if (factor.error) throw factor.error;
  const verified = await client.auth.mfa.challengeAndVerify({
    factorId: factor.data.id,
    code: code(factor.data.totp.secret),
  });
  if (verified.error) throw verified.error;
  const receipt = {
    id: 'receipt-test',
    title: 'Disposable local original',
    url: 'https://example.invalid/test.pdf',
    documentHash: 'b'.repeat(64),
    locator: 'Test page 1',
    retrievedAt: '2026-10-06',
    rawText: 'Disposable test fixture: 1,000.50 rupees',
    permission: 'Disposable fixture only',
  };
  const raw = {
    id: candidate,
    title: 'Disposable local publication ' + seed + ' 100%_complete',
    purpose: 'Roads',
    state: 'Test state',
    district: 'Disposable district',
    areaId: area,
    financialYear: '2025-2026',
    officialIds: ['TEST-' + seed],
    location: null,
    locationPrecision: 'unknown',
    authority: null,
    authorityReceipt: null,
    physicalVerification: 'Not independently verified',
    summary: 'Disposable local fixture',
    demo: false,
    stages: [
      {
        id: 'sanction',
        label: 'Sanction',
        state: 'pending',
        date: '2025-10-06',
        amount: '1000.50',
        description: 'Disposable test sanction',
        receipts: [receipt],
      },
      ...['award', 'payment', 'completion'].map((id) => ({
        id,
        label: id,
        state: 'inaccessible',
        date: null,
        amount: null,
        description: 'Not established',
        receipts: [],
      })),
    ],
    money: [
      {
        id: 'event-test',
        canonicalId: 'test-event-' + seed,
        measure: 'sanction',
        amount: '1000.50',
        originalAmount: '1,000.50',
        originalUnit: 'rupees',
        kind: 'transaction',
        date: '2025-10-06',
        receiptId: receipt.id,
        approved: false,
      },
    ],
  };
  const stage = await admin.rpc('stage_ingestion', {
    p_source: {
      id: source,
      name: 'Disposable local source',
      official_url: receipt.url,
      family: 'test',
    },
    p_document: {
      original_url: receipt.url,
      sha256: receipt.documentHash,
      storage_path: 'test/no-production-original',
      content_type: 'application/pdf',
      manifest: { test: true },
      parser_version: 'test',
    },
    p_candidates: [raw],
  });
  if (stage.error) throw stage.error;
  assert(stage.data === 1, 'First source candidate not counted accurately');
  const again = await admin.rpc('stage_ingestion', {
    p_source: {
      id: source,
      name: 'Disposable local source',
      official_url: receipt.url,
      family: 'test',
    },
    p_document: {
      original_url: receipt.url,
      sha256: receipt.documentHash,
      storage_path: 'test/no-production-original',
      content_type: 'application/pdf',
      manifest: { test: true },
      parser_version: 'test',
    },
    p_candidates: [raw],
  });
  if (again.error) throw again.error;
  assert(again.data === 0, 'Duplicate import inflated inserted count');
  const newEdition = await admin.rpc('stage_ingestion', {
    p_source: {
      id: source,
      name: 'Disposable local source',
      official_url: receipt.url,
      family: 'test',
    },
    p_document: {
      original_url: receipt.url,
      sha256: 'c'.repeat(64),
      storage_path: 'test/second-disposable-original',
      content_type: 'application/pdf',
      manifest: { test: true },
      parser_version: 'test',
    },
    p_candidates: [{ ...raw, summary: 'New source edition pending explicit adoption' }],
  });
  if (newEdition.error) throw newEdition.error;
  assert(newEdition.data === 0, 'New source edition should not create a second work identity');
  assert(
    sql(
      `select count(*) from private.candidate_import_editions where candidate_id='${candidate}';`,
    ) === '2',
    'New source edition was silently dropped',
  );
  assert(
    sql(
      `select count(*) from private.candidate_import_editions where candidate_id='${candidate}' and payload is null and length(payload_hash)=64;`,
    ) === '1',
    'Primary edition must reference its immutable original payload',
  );
  const changedOriginal = await admin.rpc('stage_ingestion', {
    p_source: {
      id: source,
      name: 'Disposable local source',
      official_url: receipt.url,
      family: 'test',
    },
    p_document: {
      original_url: receipt.url,
      sha256: receipt.documentHash,
      storage_path: 'test/no-production-original',
      content_type: 'application/pdf',
      manifest: { test: true },
      parser_version: 'test-changed',
    },
    p_candidates: [{ ...raw, summary: 'Changed parser output' }],
  });
  assert(changedOriginal.error, 'Changed parser output overwrote the original');
  let immutable = false;
  try {
    sql(
      `update private.ingestion_candidates set payload=payload||'{"summary":"Illegal original edit"}'::jsonb where id='${candidate}';`,
    );
  } catch (e) {
    immutable = String(e.stderr).includes('Original candidate payload and identity are immutable');
  }
  assert(immutable, 'Candidate base payload is mutable');
  assert(
    sql(
      `select d.sha256 from private.ingestion_candidates c join private.source_documents d on d.id=c.document_id where c.id='${candidate}';`,
    ) === receipt.documentHash,
    'New source edition overwrote primary evidence without review',
  );
  const defaultPage = await client.rpc('admin_candidates_page', {
    p_offset: -5,
    p_limit: 1,
    p_query: '',
  });
  if (defaultPage.error) throw defaultPage.error;
  assert(
    defaultPage.data.candidates.length === 1 &&
      defaultPage.data.total ===
        Number(sql("select count(*) from private.ingestion_candidates where status='pending';")),
    'Unfiltered page must retain exact total and bounded pagination',
  );
  const beyond = await client.rpc('admin_candidates_page', {
    p_offset: 10000000,
    p_limit: 1,
    p_query: '',
  });
  if (beyond.error) throw beyond.error;
  assert(
    beyond.data.candidates.length === 0 && beyond.data.total === defaultPage.data.total,
    'Empty offset page lost exact total',
  );
  const unmatched = await client.rpc('admin_candidates_page', {
    p_offset: 0,
    p_limit: 1,
    p_query: 'no-match-' + seed,
  });
  if (unmatched.error) throw unmatched.error;
  assert(
    unmatched.data.candidates.length === 0 && unmatched.data.total === 0,
    'Unmatched search returned candidates',
  );
  const page = await client.rpc('admin_candidates_page', {
    p_offset: 0,
    p_limit: 1,
    p_query: 'Disposable local publication',
  });
  if (page.error) throw page.error;
  assert(
    page.data.candidates.length === 1 && page.data.total >= 1,
    'Protected candidate pagination failed',
  );
  const literalSearch = await client.rpc('admin_candidates_page', {
    p_offset: 0,
    p_limit: 1,
    p_query: seed + ' 100%_complete',
  });
  if (literalSearch.error) throw literalSearch.error;
  assert(literalSearch.data.total === 1, 'Literal percent/underscore search failed');
  const wildcardSearch = await client.rpc('admin_candidates_page', {
    p_offset: 0,
    p_limit: 1,
    p_query: seed + ' 100%Xcomplete',
  });
  if (wildcardSearch.error) throw wildcardSearch.error;
  assert(wildcardSearch.data.total === 0, 'Search interpreted literal input as wildcards');
  const specific = await client.rpc('admin_candidate', { p_id: candidate });
  assert(specific.data?.id === candidate, 'Candidate lookup must not depend on page position');
  assert((await anonymous.rpc('admin_candidates_page')).error, 'Anonymous candidate page exposed');
  const payload = {
    ...raw,
    stages: raw.stages.map((s) => ({
      ...s,
      state: s.state === 'pending' ? 'found' : s.state,
      ...(s.state === 'pending' ? { reviewStatus: 'verified' } : {}),
    })),
    money: raw.money.map((e) => ({ ...e, approved: true, reviewStatus: 'verified' })),
  };
  const initialReconciliation = await client.rpc('reconcile_candidate', {
    p_id: candidate,
    p_payload: payload,
    p_reason: 'Explicit reconciliation of the disposable publication fixture.',
  });
  if (initialReconciliation.error) throw initialReconciliation.error;
  assert(
    (
      await client.rpc('publish_reviewed_candidate', {
        p_id: candidate,
        p_payload: payload,
        p_reason: 'Disposable publication security test.',
      })
    ).error,
    'Unlicensed source published',
  );
  const document = sql(
    `select id from private.source_documents where source_id='${source}' and sha256='${receipt.documentHash}';`,
  );
  const permission = await client.rpc('verify_source_permission', {
    p_document: document,
    p_basis: 'Disposable local fixture permission review for tests only.',
    p_evidence: 'Disposable fixture source proof, not a real government license.',
  });
  if (permission.error) throw permission.error;
  assert(
    (
      await client.rpc('publish_reviewed_candidate', {
        p_id: candidate,
        p_payload: payload,
        p_reason: 'Disposable publication security test.',
      })
    ).error,
    'Unapproved geography published',
  );
  sql(`update public.areas set approved=true where id='${area}';`);
  const first = await client.rpc('publish_reviewed_candidate', {
    p_id: candidate,
    p_payload: payload,
    p_reason: 'Disposable publication after permission and geography checks.',
  });
  if (first.error) throw first.error;
  assert(first.data === 1, 'First version not allocated');
  assert(
    sql(
      `select count(*) from private.financial_events e join private.works w on w.id=e.work_id where w.original_identifiers->>'hisaab_id'='${candidate}';`,
    ) === '1',
    'Financial provenance not recorded',
  );
  const revised = {
    ...payload,
    title: 'Reconciled publication ' + seed,
    summary: 'Explicitly reconciled disposable revision',
  };
  const reconcile = await client.rpc('reconcile_candidate', {
    p_id: candidate,
    p_payload: revised,
    p_reason: 'Explicit reconciliation of the disposable test summary.',
  });
  if (reconcile.error) throw reconcile.error;
  const revisedPage = await client.rpc('admin_candidates_page', {
    p_offset: 0,
    p_limit: 1,
    p_query: revised.title,
  });
  if (revisedPage.error) throw revisedPage.error;
  assert(
    revisedPage.data.candidates[0]?.summary === revised.summary,
    'Queue must resolve the latest reviewed payload',
  );
  const supersededSearch = await client.rpc('admin_candidates_page', {
    p_offset: 0,
    p_limit: 1,
    p_query: raw.title,
  });
  if (supersededSearch.error) throw supersededSearch.error;
  assert(supersededSearch.data.total === 0, 'Superseded original title remained searchable');
  const second = await client.rpc('publish_reviewed_candidate', {
    p_id: candidate,
    p_payload: revised,
    p_reason: 'Review and publish explicit disposable revision.',
  });
  if (second.error) throw second.error;
  assert(second.data === 2, 'Revision version not allocated');
  const visible = await anonymous
    .from('published_work_receipts')
    .select('publication_version')
    .eq('payload->>id', candidate);
  assert(
    visible.data?.length === 1 && visible.data[0].publication_version === 2,
    'Latest publication selection failed',
  );
  const withdrawn = await client.rpc('withdraw_reviewed_work', {
    p_id: candidate,
    p_reason: 'Withdraw disposable publication after verifying version history.',
  });
  if (withdrawn.error) throw withdrawn.error;
  const hidden = await anonymous
    .from('published_work_receipts')
    .select('payload')
    .eq('payload->>id', candidate);
  assert(hidden.data?.length === 0, 'Withdrawal resurrected an old version');
  console.log(
    'PASS: source permission, district approval, original provenance, explicit reconciliation, publication versions and withdrawal',
  );
} finally {
  await client.auth.signOut();
  sql(
    `begin;delete from public.publication_heads where work_id in(select id from private.works where original_identifiers->>'hisaab_id'='${candidate}');delete from public.publication_snapshots where reviewed_by='${user}';delete from private.financial_events where work_id in(select id from private.works where original_identifiers->>'hisaab_id'='${candidate}');delete from private.facts where reviewed_by='${user}';delete from private.works where original_identifiers->>'hisaab_id'='${candidate}';delete from private.candidate_revisions where reviewed_by='${user}';delete from private.candidate_import_editions where candidate_id in(select id from private.ingestion_candidates where source_id='${source}');delete from private.ingestion_candidates where source_id='${source}';delete from private.source_permission_reviews where reviewed_by='${user}';delete from private.source_documents where source_id='${source}';delete from public.sources where id='${source}';delete from public.areas where id='${area}';delete from private.audit_events where actor='${user}';delete from private.admin_members where user_id='${user}';commit;`,
  );
  await admin.auth.admin.deleteUser(user);
}
