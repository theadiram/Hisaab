import { localTestDatabaseContainer } from './local-test-database.mjs';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
process.loadEnvFile('.env.local');
if (new URL(process.env.SUPABASE_URL).hostname !== '127.0.0.1')
  throw new Error('Disposable local database required');
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  }),
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  }),
  anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
const seed = randomBytes(8).toString('hex'),
  pdfHash = randomBytes(32).toString('hex'),
  workbookHash = randomBytes(32).toString('hex'),
  password = randomBytes(20).toString('hex');
function sql(s) {
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
    { input: s, encoding: 'utf8' },
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
const created = await service.auth.admin.createUser({
  email: `budget-${seed}@example.invalid`,
  password,
  email_confirm: true,
});
if (created.error) throw created.error;
const id = created.data.user.id;
const sourceExisted =
  sql("select count(*) from public.sources where id='union-budget-2026';") === '1';
const payload = {
  identity: 'union-budget-2026:demand:85:actual:2024-2025',
  demandNumber: 85,
  department: 'Disposable budget ' + seed,
  measure: 'actual',
  financialYear: '2024-2025',
  revenueCrore: '1.00',
  capitalCrore: '2.00',
  totalCrore: '3.00',
  unit: 'crore',
  scope: 'union_demand_net',
  workId: null,
  location: null,
  workPayment: false,
  locator: 'Disposable fixture PDF page 1',
  pdfPage: 1,
};
const stage = (records, pdf = pdfHash) =>
  service.rpc('stage_budget_context', {
    p_pdf_hash: pdf,
    p_workbook_hash: workbookHash,
    p_records: records,
  });
try {
  sql(
    `insert into private.admin_members(user_id) values('${id}');insert into public.sources(id,name,official_url,family,access_method) values('union-budget-2026','Disposable budget fixture','https://example.invalid','test','test') on conflict do nothing;insert into private.source_documents(source_id,original_url,sha256,storage_path,content_type) values('union-budget-2026','https://example.invalid/test.pdf','${pdfHash}','test/budget-fixture','application/pdf'),('union-budget-2026','https://example.invalid/test.xlsx','${workbookHash}','test/budget-fixture','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');`,
  );
  assert(
    (await stage([payload], randomBytes(32).toString('hex'))).error,
    'Missing authoritative PDF was accepted',
  );
  for (const bad of [
    { ...payload, workPayment: true },
    { ...payload, totalCrore: '4.00' },
    { ...payload, measure: 'payment' },
    { ...payload, capitalCrore: 2 },
  ])
    assert((await stage([bad])).error, 'Invalid financial context was accepted');
  const first = await stage([payload]);
  if (first.error) throw first.error;
  assert(first.data === 1, 'First insertion count');
  assert((await stage([payload])).data === 0, 'Idempotent import inflated count');
  assert(
    (await stage([{ ...payload, department: 'Changed original' }])).error,
    'Source original overwritten',
  );
  const unknown = {
    ...payload,
    identity: 'union-budget-2026:demand:40:budget_estimate:2026-2027',
    demandNumber: 40,
    measure: 'budget_estimate',
    financialYear: '2026-2027',
    revenueCrore: null,
    capitalCrore: null,
    totalCrore: null,
  };
  const unspecified = await stage([unknown]);
  if (unspecified.error) throw unspecified.error;
  assert((await anon.rpc('admin_budget_context')).error, 'Anonymous budget read exposed');
  assert(
    (
      await client.rpc('stage_budget_context', {
        p_pdf_hash: pdfHash,
        p_workbook_hash: workbookHash,
        p_records: [],
      })
    ).error,
    'Public budget intake exposed',
  );
  const login = await client.auth.signInWithPassword({ email: created.data.user.email, password });
  if (login.error) throw login.error;
  assert((await client.rpc('admin_budget_context')).error, 'Password-only budget access');
  const factor = await client.auth.mfa.enroll({ factorType: 'totp' });
  if (factor.error) throw factor.error;
  const verified = await client.auth.mfa.challengeAndVerify({
    factorId: factor.data.id,
    code: totp(factor.data.totp.secret),
  });
  if (verified.error) throw verified.error;
  const page = await client.rpc('admin_budget_context', { p_offset: 0, p_query: seed });
  if (page.error) throw page.error;
  assert(page.data.totalDemands === 2 && page.data.records.length === 2, 'MFA search/count failed');
  assert(
    page.data.records.some((r) => r.totalCrore === null),
    'Unspecified value became zero',
  );
  assert(
    page.data.records.every((r) => r.sourceDocument.permissionReviewed === false),
    'Unreviewed budget permission inferred',
  );
  sql(`update private.admin_members set enabled=false where user_id='${id}';`);
  assert(
    (await client.rpc('admin_budget_context')).error,
    'Revoked administrator retained budget access',
  );
  console.log(
    'PASS: budget identity, exact amounts, PDF requirement, immutable/idempotent intake, null semantics, MFA and membership isolation',
  );
} finally {
  await client.auth.signOut();
  sql(
    `begin;delete from private.budget_context where document_id in(select id from private.source_documents where sha256 in('${pdfHash}','${workbookHash}'));delete from private.source_documents where sha256 in('${pdfHash}','${workbookHash}');delete from private.admin_members where user_id='${id}';${sourceExisted ? '' : "delete from public.sources where id='union-budget-2026';"}commit;`,
  );
  await service.auth.admin.deleteUser(id);
}
