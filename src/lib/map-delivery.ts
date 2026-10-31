export function mapDeliveryBase(value = process.env.NEXT_PUBLIC_HISAAB_MAP_TILE_BASE_URL ?? '') {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}
