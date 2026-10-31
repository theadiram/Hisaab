import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
process.loadEnvFile('.env.local');
if (new URL(process.env.SUPABASE_URL).hostname !== '127.0.0.1')
  throw new Error('Disposable local database required');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const email = `mfa-test-${randomBytes(8).toString('hex')}@example.invalid`,
  password = randomBytes(20).toString('hex');
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
const id = data.user.id;
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
    { input: s, encoding: 'utf8' },
  );
}
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.toUpperCase().replace(/=+$/, ''))
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', key).update(counter).digest();
  const offset = hash[19] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
try {
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const denied = await client.rpc('admin_context');
  if (denied.data) throw new Error('Unprivileged account gained access');
  sql(`insert into private.admin_members(user_id) values('${id}');`);
  const aal1 = await client.rpc('admin_context');
  if (aal1.data) throw new Error('Password-only membership gained access');
  const enrolled = await client.auth.mfa.enroll({ factorType: 'totp' });
  if (enrolled.error) throw enrolled.error;
  const bad = await client.auth.mfa.challengeAndVerify({
    factorId: enrolled.data.id,
    code: 'not-a-code',
  });
  if (!bad.error) throw new Error('Invalid code accepted');
  const valid = await client.auth.mfa.challengeAndVerify({
    factorId: enrolled.data.id,
    code: totp(enrolled.data.totp.secret),
  });
  if (valid.error) throw valid.error;
  const accepted = await client.rpc('admin_context');
  if (accepted.error || accepted.data !== id) throw new Error('MFA administrator rejected');
  const jwt = (await client.auth.getSession()).data.session.access_token;
  sql(`update private.admin_members set enabled=false where user_id='${id}';`);
  if ((await client.rpc('admin_context')).data)
    throw new Error('Disabled administrator retained access');
  sql(`update private.admin_members set enabled=true where user_id='${id}';`);
  await client.auth.signOut();
  const stale = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  if ((await stale.rpc('admin_context')).data) throw new Error('Revoked session retained access');
  const anonymous = await createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
  ).rpc('admin_candidates');
  if (!anonymous.error) throw new Error('Anonymous review access');
  console.log(
    'PASS: nonmember, password-only, invalid code, valid MFA, membership removal, session revocation and anonymous isolation',
  );
} finally {
  sql(`delete from private.admin_members where user_id='${id}';`);
  await admin.auth.admin.deleteUser(id);
}
