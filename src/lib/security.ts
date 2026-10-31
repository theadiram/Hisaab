import { timingSafeEqual, createHash } from 'node:crypto';
export function equalSecret(a: string, b: string) {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
}
export function isLocalHost(host: string) {
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
}
export function authorizedPreview(request: Request) {
  const host = new URL(request.url).host;
  if (process.env.NODE_ENV !== 'production' && isLocalHost(host)) return true;
  const token = process.env.HISAAB_ADMIN_TOKEN;
  if (!token) return false;
  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return equalSecret(auth.slice(7), token);
  if (auth.startsWith('Basic ')) {
    try {
      const value = Buffer.from(auth.slice(6), 'base64').toString();
      return equalSecret(value.slice(value.indexOf(':') + 1), token);
    } catch {
      return false;
    }
  }
  return false;
}
export function requireOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const target = new URL(request.url);
    const host = request.headers.get('host') || target.host;
    const expected = process.env.HISAAB_APP_ORIGIN;
    if (expected) return origin === expected;
    const local =
      process.env.NODE_ENV !== 'production' &&
      isLocalHost(url.host) &&
      isLocalHost(host) &&
      url.port === target.port;
    return local || (url.host === host && url.protocol === 'https:');
  } catch {
    return false;
  }
}
const attempts = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit = 10) {
  const now = Date.now();
  if (attempts.size > 10000) {
    for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
  }
  const v = attempts.get(key);
  if (!v || v.reset < now) {
    attempts.set(key, { count: 1, reset: now + 60000 });
    return true;
  }
  v.count++;
  return v.count <= limit;
}
