import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/admin', () => ({
  requireAdmin: vi.fn().mockRejectedValue(new Error('MFA required')),
}));
vi.mock('node:fs/promises', () => ({ readFile: vi.fn(), stat: vi.fn() }));
import { requireAdmin } from '@/lib/admin';
import { readFile, stat } from 'node:fs/promises';
import { GET } from '../src/app/api/v1/admin/department-exports/route';
describe('export review access boundary', () => {
  it('checks MFA before any private filesystem access', async () => {
    const response = await GET(new Request('http://localhost/api/v1/admin/department-exports'));
    expect(requireAdmin).toHaveBeenCalled();
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(readFile).not.toHaveBeenCalled();
    expect(stat).not.toHaveBeenCalled();
  });
});
