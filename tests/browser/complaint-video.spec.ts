import { test, expect } from './preview-fixture';
import { testDatabaseUrl } from './test-environment';
import { readFile } from 'node:fs/promises';
import { createCipheriv, createHash } from 'node:crypto';
const headers = { Origin: 'http://127.0.0.1:3000' };
test('encrypted videos are resumable, byte-exact, private to their case and deleted with it', async ({
  page,
  request,
}) => {
  const created = await page.request.post('/api/v1/reports', {
    headers,
    data: {
      workId: null,
      description: 'Disposable evidence transport test. No actual development allegation.',
      observedDate: '2026-10-04',
      consent: true,
      demo: true,
    },
  });
  expect(created.status()).toBe(201);
  const token = (await created.json()).trackingUrl.split('#track=')[1];
  await page.request.post('/api/v1/reports/session', { headers, data: { token } });
  try {
    const clip = await readFile('tests/evidence-test.mp4'),
      padding = Buffer.alloc(3 * 1024 * 1024 + 64);
    padding.writeUInt32BE(padding.length, 0);
    padding.write('free', 4);
    const bytes = Buffer.concat([clip, padding]),
      sha256 = createHash('sha256').update(bytes).digest('hex'),
      begin = await page.request.post('/api/v1/reports/videos', {
        headers,
        data: {
          action: 'begin',
          name: 'Disposable synthetic blue frame.mp4',
          mime: 'video/mp4',
          size: bytes.length,
          sha256,
        },
      });
    expect(begin.status()).toBe(200);
    const init = await begin.json(),
      cipher = createCipheriv(
        'aes-256-gcm',
        Buffer.from(init.key, 'base64'),
        Buffer.from(init.nonce, 'base64'),
      ),
      encrypted = Buffer.concat([cipher.update(bytes), cipher.final(), cipher.getAuthTag()]);
    expect(encrypted).not.toEqual(bytes);
    const supabaseUrl = testDatabaseUrl();
    for (let i = 0; i < init.parts.length; i++) {
      const part = init.parts[i],
        chunk = encrypted.subarray(i * 3 * 1024 * 1024, (i + 1) * 3 * 1024 * 1024),
        r = await page.request.put(
          supabaseUrl +
            '/storage/v1/object/upload/sign/case-videos/' +
            part.path +
            '?token=' +
            encodeURIComponent(part.token),
          { headers: { 'Content-Type': 'application/octet-stream' }, data: chunk },
        );
      expect(r.status()).toBe(200);
      const checked = await page.request.post('/api/v1/reports/videos', {
        headers,
        data: {
          action: 'check_part',
          id: init.id,
          index: i,
          size: chunk.length,
          sha256: createHash('sha256').update(chunk).digest('hex'),
        },
      });
      expect((await checked.json()).stored).toBe(true);
    }
    const finish = await page.request.post('/api/v1/reports/videos', {
      headers,
      data: { action: 'complete', id: init.id },
    });
    expect(finish.status()).toBe(200);
    const own = await page.request.get('/api/v1/reports/videos/' + init.id);
    expect(own.status()).toBe(200);
    expect(await own.body()).toEqual(bytes);
    expect(own.headers()['cache-control']).toContain('no-store');
    expect((await request.get('/api/v1/reports/videos/' + init.id)).status()).toBe(401);
    const range = await page.request.get('/api/v1/reports/videos/' + init.id, {
      headers: { Range: 'bytes=4-7' },
    });
    expect(range.status()).toBe(206);
    expect(await range.body()).toEqual(bytes.subarray(4, 8));
    expect(
      (
        await page.request.get('/api/v1/reports/videos/' + init.id, {
          headers: { Range: 'bytes=' + String(bytes.length + 100) + '-' },
        })
      ).status(),
    ).toBe(416);
    const publicObject = await request.get(
      supabaseUrl + '/storage/v1/object/public/case-videos/' + init.parts[0].path,
    );
    expect(publicObject.status()).not.toBe(200);
    const removed = await page.request.delete('/api/v1/reports/videos/' + init.id, { headers });
    expect(removed.status()).toBe(200);
    expect((await page.request.get('/api/v1/reports/videos/' + init.id)).status()).toBe(404);
  } finally {
    await page.request.delete('/api/v1/reports/session', { headers });
  }
});
test('complaint preparation is private and neither a sent email nor a forged acknowledgement', async ({
  page,
  request,
}) => {
  const created = await page.request.post('/api/v1/reports', {
    headers,
    data: {
      workId: null,
      description: 'Disposable portal handoff test; not an actual complaint.',
      observedDate: '2026-10-04',
      consent: true,
      demo: false,
    },
  });
  expect(created.status()).toBe(201);
  const token = (await created.json()).trackingUrl.split('#track=')[1];
  await page.request.post('/api/v1/reports/session', { headers, data: { token } });
  try {
    const r = await page.request.post('/api/v1/reports/complaint', {
      headers,
      data: {
        routeId: 'cpgrams',
        draft: 'Disposable test packet. Do not file or send this synthetic observation.',
        replyTo: null,
        consent: true,
        delegationConsent: false,
      },
    });
    expect(r.status()).toBe(201);
    const saved = await r.json();
    expect(saved.filed).toBe(false);
    expect((await (await page.request.get('/api/v1/reports/complaint')).json()).packet.status).toBe(
      'prepared',
    );
    expect((await request.get('/api/v1/reports/complaint')).status()).toBe(401);
    expect(
      (
        await page.request.post('/api/v1/reports/events', {
          headers,
          data: {
            type: 'acknowledged',
            description: 'Fake authority acknowledgement must be rejected.',
            date: '2026-10-04',
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post('/api/v1/admin/complaints/evidence', {
          headers,
          data: { id: saved.id },
        })
      ).status(),
    ).toBe(401);
  } finally {
    await page.request.delete('/api/v1/reports/session', { headers });
  }
});
