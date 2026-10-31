'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
type Task = { id: string; blob: Blob; parts: { path: string; token: string }[]; next: number };
export function PrivateVideos() {
  const [videos, setVideos] = useState<{ id: string; name: string; sha256: string }[]>([]),
    [message, setMessage] = useState(''),
    [progress, setProgress] = useState<number | null>(null),
    [paused, setPaused] = useState(false),
    pause = useRef(false),
    running = useRef(false),
    task = useRef<Task | null>(null);
  async function refresh() {
    const r = await fetch('/api/v1/reports/videos');
    if (r.ok) setVideos((await r.json()).videos);
  }
  useEffect(() => {
    void refresh();
    return () => {
      pause.current = true;
    };
  }, []);
  async function send() {
    if (running.current || !task.current) return;
    running.current = true;
    pause.current = false;
    setPaused(false);
    const t = task.current,
      client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false } },
      );
    try {
      while (t.next < t.parts.length && !pause.current) {
        const part = t.parts[t.next],
          chunk = t.blob.slice(t.next * 3 * 1024 * 1024, (t.next + 1) * 3 * 1024 * 1024),
          r = await client.storage
            .from('case-videos')
            .uploadToSignedUrl(part.path, part.token, chunk, {
              contentType: 'application/octet-stream',
            });
        if (r.error) {
          const bytes = await chunk.arrayBuffer(),
            sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
              .map((b) => b.toString(16).padStart(2, '0'))
              .join(''),
            checked = await fetch('/api/v1/reports/videos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'check_part',
                id: t.id,
                index: t.next,
                size: chunk.size,
                sha256,
              }),
            });
          if (!checked.ok || !(await checked.json()).stored)
            throw new Error(
              'A chunk upload failed. Resume within two hours; your evidence remains private.',
            );
        }
        t.next++;
        setProgress(Math.round((t.next / t.parts.length) * 100));
      }
      if (pause.current) {
        setPaused(true);
        setMessage('Paused after the current encrypted chunk.');
        return;
      }
      const complete = await fetch('/api/v1/reports/videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete', id: t.id }),
        }),
        d = await complete.json();
      if (!complete.ok) throw new Error(d.error);
      task.current = null;
      setProgress(null);
      setMessage('Encrypted video saved privately; original checksum and file signature checked.');
      await refresh();
    } catch (e) {
      setPaused(true);
      setMessage((e as Error).message);
    } finally {
      running.current = false;
    }
  }
  return (
    <section>
      <h3>Private video evidence</h3>
      <p>
        Up to three MP4 or WebM files, 25 MB each. Encrypted before upload. Pause and resume in this
        open panel within two hours. Original metadata remains private.
      </p>
      {videos.map((v) => (
        <figure key={v.id}>
          <video
            controls
            preload="none"
            src={'/api/v1/reports/videos/' + v.id}
            style={{ width: '100%' }}
          />
          <figcaption>
            {v.name} · SHA-256 {v.sha256}
          </figcaption>
          <button
            className="secondary"
            onClick={async () => {
              const r = await fetch('/api/v1/reports/videos/' + v.id, { method: 'DELETE' });
              if (r.ok) await refresh();
            }}
          >
            Delete this video
          </button>
        </figure>
      ))}
      <label className="field">
        Add a private video
        <input
          type="file"
          accept="video/mp4,video/webm"
          disabled={progress !== null}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 25 * 1024 * 1024) {
              setMessage('Choose a video up to 25 MB.');
              return;
            }
            setMessage('Encrypting on this device…');
            setProgress(0);
            try {
              const bytes = await file.arrayBuffer(),
                sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
                  .map((b) => b.toString(16).padStart(2, '0'))
                  .join(''),
                r = await fetch('/api/v1/reports/videos', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'begin',
                    name: file.name,
                    mime: file.type,
                    size: file.size,
                    sha256,
                  }),
                }),
                d = await r.json();
              if (!r.ok) throw new Error(d.error);
              const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
                key = await crypto.subtle.importKey('raw', decode(d.key), 'AES-GCM', false, [
                  'encrypt',
                ]),
                encrypted = await crypto.subtle.encrypt(
                  { name: 'AES-GCM', iv: decode(d.nonce) },
                  key,
                  bytes,
                );
              task.current = {
                id: d.id,
                blob: new Blob([encrypted], { type: 'application/octet-stream' }),
                parts: d.parts,
                next: 0,
              };
              setMessage('Uploading encrypted chunks…');
              await send();
            } catch (error) {
              setMessage((error as Error).message);
              setProgress(null);
            }
          }}
        />
      </label>
      {progress !== null && (
        <>
          <progress max={100} value={progress} />
          <span> {progress}%</span>
          <button
            className="secondary"
            onClick={() => {
              if (paused) void send();
              else {
                pause.current = true;
                setMessage('Finishing the current encrypted chunk…');
              }
            }}
          >
            {paused ? 'Resume upload' : 'Pause upload'}
          </button>
          {paused && (
            <button
              className="secondary"
              onClick={async () => {
                if (task.current)
                  await fetch('/api/v1/reports/videos/' + task.current.id, { method: 'DELETE' });
                task.current = null;
                setProgress(null);
              }}
            >
              Discard unfinished upload
            </button>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
