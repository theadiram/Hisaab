import { describe, it, expect } from 'vitest';
import { boundedBody, BodyLimitError } from '../src/lib/request-body';
describe('bounded request streams', () => {
  it('accepts an exact limit and rejects a misleading length header', async () => {
    expect(
      (await boundedBody(new Request('http://localhost', { method: 'POST', body: 'abcd' }), 4))
        .byteLength,
    ).toBe(4);
    await expect(
      boundedBody(
        new Request('http://localhost', {
          method: 'POST',
          body: 'abcdefgh',
          headers: { 'content-length': '1' },
        }),
        4,
      ),
    ).rejects.toBeInstanceOf(BodyLimitError);
  });
  it('cancels a chunked stream before reading the remaining payload', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(5));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request('http://localhost', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit);
    await expect(boundedBody(request, 4)).rejects.toBeInstanceOf(BodyLimitError);
    expect(cancelled).toBe(true);
  });
});
