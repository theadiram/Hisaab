/** Cache only source geography/inventory, which does not contain approval decisions. */
export function historicalCacheHeaders(
  browserSeconds: number,
  edgeSeconds: number,
  queryKeys?: string,
): Record<string, string> {
  if (
    process.env.HISAAB_PUBLIC_PREVIEW !== 'true' ||
    process.env.HISAAB_PUBLIC_RELEASE === 'true'
  ) {
    return { 'Cache-Control': 'private, no-store' };
  }
  return {
    'Cache-Control': `public, max-age=${browserSeconds}, s-maxage=${edgeSeconds}`,
    'Netlify-CDN-Cache-Control': `public, durable, max-age=${edgeSeconds}`,
    ...(queryKeys ? { 'Netlify-Vary': `query=${queryKeys}` } : {}),
  };
}
