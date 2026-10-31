import 'server-only';

// Read on demand: tests and request handlers must observe the current environment.
function value(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function catalogueConnection() {
  const dedicated = value('HISAAB_CATALOGUE_API_URL');
  const url = dedicated ?? value('SUPABASE_URL');
  const key = dedicated ? value('HISAAB_CATALOGUE_API_KEY') : value('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) throw new Error('Published catalogue connection unavailable');
  return { url, key };
}

export function ownerConnection() {
  const url = value('SUPABASE_URL');
  const key = value('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) throw new Error('Administrator authentication unavailable');
  return { url, key };
}

export function privateConnection() {
  const url = value('SUPABASE_URL');
  const key = value('SUPABASE_SECRET_KEY');
  if (!url || !key) {
    throw new Error('Private case storage is not configured. No observation was saved.');
  }
  return { url, key };
}
