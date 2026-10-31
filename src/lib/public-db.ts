import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { catalogueConnection } from './server-config';
// Request-scoped server clients must not retain themselves through refresh timers.
export function publicDb() {
  const { url, key } = catalogueConnection();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
