export async function GET() {
  const configured =
    process.env.HISAAB_DATA_MODE === 'supabase' &&
    !!process.env.SUPABASE_URL &&
    !!process.env.SUPABASE_SECRET_KEY &&
    /^[a-f0-9]{64}$/i.test(process.env.HISAAB_CAPABILITY_SECRET ?? '');
  return Response.json(
    {
      application: 'hisaab',
      status:
        process.env.HISAAB_PUBLIC_PREVIEW === 'true' ? 'public_read_only_preview' : 'private_build',
      publicRelease: false,
      caseStorage: configured
        ? 'supabase_encrypted'
        : process.env.NODE_ENV === 'development'
          ? 'local_encrypted'
          : 'not_configured',
      ai: 'disabled',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
