import { expect, it } from 'vitest';
import { publicPreviewRead } from '../src/lib/public-preview-access';
it('opens only published browsing routes in the read-only preview', () => {
  for (const path of [
    '/',
    '/state/21',
    '/asset/abc',
    '/api/v1/works/abc',
    '/api/v1/map/assets',
    '/images/demo/example.png',
  ])
    expect(publicPreviewRead(path, 'GET')).toBe(true);
  for (const path of [
    '/admin',
    '/api/v1/admin/review',
    '/api/v1/reports',
    '/api/v1/reports/media/abc',
    '/api/v1/content-control',
    '/studio',
    '/api/v1/works-private',
  ])
    expect(publicPreviewRead(path, 'GET')).toBe(false);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH'])
    expect(publicPreviewRead('/api/v1/works', method)).toBe(false);
});
