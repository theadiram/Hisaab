/** Public preview exposes published read routes; owner and citizen writes stay closed. */
export function publicPreviewRead(path: string, method: string) {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (path === '/' || path === '/spending' || /^\/(state|asset)\/[^/]+$/.test(path)) return true;
  if (/^\/(geography|backgrounds|images|vendor)\//.test(path)) return true;
  return /^\/api\/v1\/(works|map|areas|assets|aggregates|coverage|development|evidence-progress|jurisdiction-evidence|funding|geography|health|ingestion|parties|spending)(\/|$)/.test(
    path,
  );
}
