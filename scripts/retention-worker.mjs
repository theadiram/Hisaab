export async function removeExpiredCases(client, { enabled = false } = {}) {
  if (!enabled) return { enabled: false, deleted: 0 };
  const expired = await client.rpc('expired_case_files', { p_limit: 5 });
  if (expired.error) throw new Error('Expired-case lookup failed');
  if (!Array.isArray(expired.data) || expired.data.length > 5)
    throw new Error('Unbounded retention response');
  let deleted = 0;
  for (const item of expired.data) {
    if (!/^[a-f0-9]{64}$/.test(item.hash)) throw new Error('Invalid expired-case identity');
    const groups = [
      ['case-originals', (item.photos ?? []).map((p) => p.original)],
      ['case-derivatives', (item.photos ?? []).map((p) => p.derivative)],
      ['case-documents', item.documents ?? []],
      ['case-videos', item.videos ?? []],
    ];
    for (const [bucket, paths] of groups) {
      if (
        paths.length > (bucket === 'case-documents' ? 10 : bucket === 'case-videos' ? 30 : 5) ||
        paths.some(
          (p) =>
            typeof p !== 'string' ||
            !p.startsWith(item.hash + '/') ||
            !(
              bucket === 'case-videos'
                ? /^([a-f0-9]{64})\/[a-f0-9-]{36}\/[0-9]+\.enc$/
                : /^([a-f0-9]{64})\/[a-f0-9-]{36}\.(enc|webp)$/
            ).test(p),
        )
      )
        throw new Error('Retention path falls outside its expired case');
    }
    for (const [bucket, paths] of groups) {
      if (paths.length) {
        const removed = await client.storage.from(bucket).remove(paths);
        if (removed.error)
          throw new Error('Expired files could not be removed; metadata retained for retry');
      }
    }
    const removed = await client.rpc('delete_expired_case', { p_hash: item.hash });
    if (removed.error || removed.data !== true)
      throw new Error('Expired-case metadata deletion failed');
    deleted++;
  }
  return { enabled: true, deleted };
}
