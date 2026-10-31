import { existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
if (existsSync('.env.local')) {
  console.log('Existing local environment preserved.');
  process.exit(0);
}
let status;
try {
  status = JSON.parse(
    execFileSync('npx', ['supabase', 'status', '--output', 'json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    }),
  );
} catch {
  throw new Error('Local Supabase status unavailable. Start the local database first.');
}
const url = status.API_URL;
const publishable = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const secret = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
if (!url || !publishable || !secret || new URL(url).hostname !== '127.0.0.1')
  throw new Error('Local database configuration incomplete');
writeFileSync(
  '.env.local',
  [
    'HISAAB_PUBLIC_RELEASE=false',
    'HISAAB_DATA_MODE=supabase',
    'HISAAB_APP_ORIGIN=http://127.0.0.1:3000',
    `SUPABASE_URL=${url}`,
    `SUPABASE_PUBLISHABLE_KEY=${publishable}`,
    `SUPABASE_SECRET_KEY=${secret}`,
    `NEXT_PUBLIC_SUPABASE_URL=${url}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable}`,
    `HISAAB_CAPABILITY_SECRET=${randomBytes(32).toString('hex')}`,
    `HISAAB_ADMIN_TOKEN=${randomBytes(32).toString('hex')}`,
    'AI_ENABLED=false',
    '',
  ].join('\n'),
  { mode: 0o600, flag: 'wx' },
);
console.log('Local environment configured securely.');
