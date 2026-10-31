import { it, expect, vi } from 'vitest';
import { removeExpiredCases } from '../scripts/retention-worker.mjs';
const hash = 'a'.repeat(64),
  id = '11111111-1111-4111-8111-111111111111';
function client(error = false, path = hash + '/' + id + '.enc') {
  const calls: string[] = [];
  const db = {
    rpc: vi.fn(async (name: string) => {
      calls.push(name);
      return name === 'expired_case_files'
        ? { data: [{ hash, photos: [], documents: [path] }], error: null }
        : { data: true, error: null };
    }),
    storage: {
      from: () => ({
        remove: vi.fn(async () => {
          calls.push('remove-files');
          return { error: error ? new Error('failed') : null };
        }),
      }),
    },
  };
  return { db, calls };
}
it('retention is disabled until configured', async () => {
  const { db } = client();
  expect(await removeExpiredCases(db)).toEqual({ enabled: false, deleted: 0 });
  expect(db.rpc).not.toHaveBeenCalled();
});
it('removes expired files before deleting metadata', async () => {
  const { db, calls } = client();
  expect(await removeExpiredCases(db, { enabled: true })).toEqual({ enabled: true, deleted: 1 });
  expect(calls).toEqual(['expired_case_files', 'remove-files', 'delete_expired_case']);
});
it('retains metadata when storage deletion fails', async () => {
  const { db, calls } = client(true);
  await expect(removeExpiredCases(db, { enabled: true })).rejects.toThrow('metadata retained');
  expect(calls).not.toContain('delete_expired_case');
});
it('rejects paths belonging to another case', async () => {
  const { db, calls } = client(false, 'b'.repeat(64) + '/' + id + '.enc');
  await expect(removeExpiredCases(db, { enabled: true })).rejects.toThrow(
    'outside its expired case',
  );
  expect(calls).toEqual(['expired_case_files']);
});
