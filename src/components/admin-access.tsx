'use client';
import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ReviewConsole } from './review-console';
import type { Work } from '@/lib/model';
export function AdminAccess() {
  const [client] = useState(() =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    ),
  );
  const [showLocalSetup, setShowLocalSetup] = useState(false);
  const [total, setTotal] = useState(0);
  const [works, setWorks] = useState<Work[] | null>(null),
    [message, setMessage] = useState(''),
    [factor, setFactor] = useState(''),
    [qr, setQr] = useState(''),
    [busy, setBusy] = useState(false);
  async function load(required = false) {
    const r = await fetch('/api/v1/admin/review');
    if (!r.ok) {
      if (required)
        throw new Error(
          r.status === 401
            ? 'Administrator session expired. Sign in again.'
            : 'Your sign-in succeeded, but the review queue could not load. Retry opening reviews.',
        );
      return;
    }
    const data = await r.json();
    setWorks(data.candidates);
    setTotal(data.total);
  }
  useEffect(() => {
    void load().catch(() => setMessage('The review queue is unavailable. Please retry.'));
  }, []);
  useEffect(() => {
    setShowLocalSetup(['127.0.0.1', 'localhost'].includes(window.location.hostname));
  }, []);
  async function action(task: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await task();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (works)
    return (
      <>
        <ReviewConsole works={works} total={total} />
        <div className="review-page">
          <button
            onClick={() =>
              void action(async () => {
                const r = await fetch('/api/v1/admin/session', { method: 'DELETE' });
                if (!r.ok) throw new Error('Sign out failed; retry.');
                await client.auth.signOut();
                setWorks(null);
                setFactor('');
                setQr('');
              })
            }
          >
            Sign out
          </button>
        </div>
      </>
    );
  return (
    <main className="review-page">
      <a href="/">Return to map</a>
      <div className="eyebrow">PRIVATE ADMINISTRATION</div>
      <h1>Evidence deserves a careful review.</h1>
      <p>
        Sign in with your administrator account and authenticator. Access is checked again for every
        review decision.
      </p>
      {!factor ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void action(async () => {
              const login = await client.auth.signInWithPassword({
                email: String(form.get('email')),
                password: String(form.get('password')),
              });
              if (login.error) throw login.error;
              const factors = await client.auth.mfa.listFactors();
              if (factors.error) throw factors.error;
              const verified = factors.data.totp.find((f) => f.status === 'verified');
              if (verified) {
                setFactor(verified.id);
                return;
              }
              // Remove only unfinished factors from this account before retrying enrollment.
              for (const f of factors.data.all.filter((f) => f.status === 'unverified')) {
                const result = await client.auth.mfa.unenroll({ factorId: f.id });
                if (result.error) throw result.error;
              }
              const enrolled = await client.auth.mfa.enroll({
                factorType: 'totp',
                friendlyName: 'Hisaab administrator',
              });
              if (enrolled.error) throw enrolled.error;
              setFactor(enrolled.data.id);
              setQr(enrolled.data.totp.qr_code);
            });
          }}
        >
          <label className="field">
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label className="field">
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="primary" disabled={busy}>
            Sign in
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void action(async () => {
              const verified = await client.auth.mfa.challengeAndVerify({
                factorId: factor,
                code: String(form.get('code')),
              });
              if (verified.error) throw verified.error;
              const session = await client.auth.getSession();
              const token = session.data.session?.access_token;
              if (!token) throw new Error('Session unavailable');
              const result = await fetch('/api/v1/admin/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
              });
              if (!result.ok)
                throw new Error('This account needs protected administrator membership.');
              setQr('');
              await load(true);
            });
          }}
        >
          {qr && (
            <>
              <p>Scan this QR code with your authenticator. Keep it private.</p>
              <img src={qr} alt="Authenticator enrollment QR code" width={220} height={220} />
            </>
          )}
          <label className="field">
            Authenticator code
            <input
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            Verify and open reviews
          </button>
          <button
            type="button"
            onClick={() => {
              setFactor('');
              setQr('');
            }}
          >
            Back
          </button>
        </form>
      )}
      {message && <p role="alert">{message}</p>}
      {showLocalSetup && (
        <details>
          <summary>Set up the first owner</summary>
          <p>
            This local setup is available once. Use the setup secret in your private hosted
            configuration. Enter your own password here, never in chat.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const element = e.currentTarget;
              const form = new FormData(element);
              void action(async () => {
                const r = await fetch('/api/v1/admin/setup', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(Object.fromEntries(form)),
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                element.reset();
                setMessage('Owner created. Sign in above and enroll your authenticator.');
              });
            }}
          >
            <label className="field">
              Owner email
              <input name="email" type="email" required />
            </label>
            <label className="field">
              New password
              <input
                name="password"
                type="password"
                minLength={14}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="field">
              Local setup secret
              <input name="setupSecret" type="password" autoComplete="off" required />
            </label>
            <button disabled={busy}>Create first owner</button>
          </form>
        </details>
      )}
    </main>
  );
}
