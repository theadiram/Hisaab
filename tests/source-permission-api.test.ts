import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/lib/admin', () => ({ requireAdmin: vi.fn() }));
import { requireAdmin } from '../src/lib/admin';
import { GET, POST } from '../src/app/api/v1/admin/source-permission/route';

const rpc = vi.fn();
const original = {
  sourceId: 'test-geometry',
  hash: 'a'.repeat(64),
  url: 'https://example.invalid/geometry',
};
const record = {
  id: '00000000-0000-4000-8000-000000000001',
  ...original,
  licenseBasis: null,
  sourceApproved: false,
  permissionReviewed: false,
};
const request = (extra = '') =>
  new Request(
    'http://localhost/api/v1/admin/source-permission?' + new URLSearchParams(original) + extra,
  );
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ client: { rpc } } as unknown as Awaited<
    ReturnType<typeof requireAdmin>
  >);
});

describe('exact private original permission lookup', () => {
  it('requires MFA before inspecting input or querying private metadata', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('MFA required'));
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('looks up exact source ID, hash and URL and returns only permitted metadata', async () => {
    rpc.mockResolvedValue({
      data: {
        ...record,
        storage_path: 'PRIVATE_PATH',
        query_manifest: { secret: 'PRIVATE_MANIFEST' },
      },
    });
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('admin_source_document_by_identity', {
      p_source_id: original.sourceId,
      p_hash: original.hash,
      p_url: original.url,
    });
    expect(body.document).toEqual(record);
    expect(JSON.stringify(body)).not.toContain('PRIVATE_');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('rejects repeated, unknown, missing and unsafe lookup fields', async () => {
    for (const extra of ['&hash=' + original.hash, '&sourceId=test-geometry', '&raw=1'])
      expect((await GET(request(extra))).status).toBe(400);
    for (const values of [
      { ...original, sourceId: '../private' },
      { ...original, hash: 'bad' },
      { ...original, url: 'http://example.invalid/source' },
      { ...original, url: 'https://secret@example.invalid/source' },
      { hash: original.hash, url: original.url },
    ]) {
      expect(
        (await GET(new Request('http://localhost/api?' + new URLSearchParams(values)))).status,
      ).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('keeps an unregistered secondary original unavailable rather than manufacturing an ID', async () => {
    rpc.mockResolvedValue({ data: null });
    expect((await GET(request())).status).toBe(404);
  });

  it('fails closed when the migration is absent or the backend identity differs', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'RPC absent' } });
    expect((await GET(request())).status).toBe(503);
    rpc.mockResolvedValueOnce({ data: { ...record, hash: 'b'.repeat(64) } });
    expect((await GET(request())).status).toBe(503);
    rpc.mockRejectedValueOnce(new Error('Network unavailable'));
    expect((await GET(request())).status).toBe(503);
  });
});

describe('explicit document permission writes remain protected', () => {
  const post = (body: unknown, origin = 'http://localhost') =>
    new Request('http://localhost/api/v1/admin/source-permission', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(body),
    });
  const decision = {
    documentId: record.id,
    basis: 'Synthetic documented permission basis checked by owner.',
    evidence: 'Synthetic source policy reference checked.',
    confirmed: true,
  };
  it('rejects cross-origin and non-MFA writes without a database call', async () => {
    expect((await POST(post(decision, 'https://evil.invalid'))).status).toBe(403);
    vi.mocked(requireAdmin).mockRejectedValue(new Error('MFA required'));
    expect((await POST(post(decision))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('requires explicit confirmation and writes only the selected document decision', async () => {
    expect((await POST(post({ ...decision, confirmed: false }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: true });
    expect((await POST(post(decision))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('verify_source_permission', {
      p_document: record.id,
      p_basis: decision.basis,
      p_evidence: decision.evidence,
    });
  });
});
