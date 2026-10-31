'use client';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clapperboard,
  Globe2,
  Map,
  Minus,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Square,
  Unplug,
} from 'lucide-react';
import type { RemoteCommand, RemoteSession } from '@/lib/content-remote';
import { cardPresets, contentPresets } from '@/lib/content-mode';

async function post(body: unknown) {
  const response = await fetch('/api/v1/content-control', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'The camera link failed.');
  return result;
}
export function ContentRemoteController() {
  const [code, setCode] = useState(''),
    [session, setSession] = useState<RemoteSession | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('Pair this controller with the Hisaab tab you are filming.');
  useEffect(() => {
    try {
      const value = sessionStorage.getItem('hisaab-content-remote');
      if (value) setSession(JSON.parse(value) as RemoteSession);
    } catch {}
  }, []);
  async function pair() {
    setBusy(true);
    setMessage('Connecting to the filming tab…');
    try {
      const result = await post({ action: 'join', code: code.replace(/\s/g, '').toUpperCase() });
      setSession(result.session);
      sessionStorage.setItem('hisaab-content-remote', JSON.stringify(result.session));
      setMessage('Connected. Camera and card controls are ready.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send(command: RemoteCommand) {
    if (!session) return;
    setBusy(true);
    try {
      await post({ action: 'command', session, command });
      setMessage('Sent to the filming tab.');
    } catch (e) {
      setMessage((e as Error).message);
      if ((e as Error).message.includes('expired')) disconnect();
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    if (session)
      try {
        await post({ action: 'close', session });
      } catch {}
    sessionStorage.removeItem('hisaab-content-remote');
    setSession(null);
    setMessage('Disconnected. Pair again from the filming tab.');
  }
  const presetGroups = ['Country', 'Region', 'Current view', 'Selected asset'] as const;
  return (
    <main className="remote-studio-page">
      <header className="remote-studio-header">
        <a href="/?explore=1" aria-label="Back to Hisaab">
          <ArrowLeft size={18} />
        </a>
        <span className="remote-studio-mark">
          <Clapperboard size={19} />
        </span>
        <div>
          <strong>Hisaab · Remote Director</strong>
          <small>Control the camera while the filming tab stays clean</small>
        </div>
        <span className={'remote-connection-state' + (session ? ' is-connected' : '')}>
          <i />
          {session ? 'Connected' : 'Not paired'}
        </span>
      </header>
      {!session ? (
        <section className="remote-pair-card">
          <span className="remote-overline">PAIR TO THE FILMING TAB</span>
          <h1>Keep the controls off camera.</h1>
          <p>
            In the Hisaab tab you are filming, open Content Mode and choose{' '}
            <b>Pair remote controller</b>. Enter the one-time code shown there.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void pair();
            }}
          >
            <label htmlFor="remote-pair-code">One-time pairing code</label>
            <div>
              <input
                id="remote-pair-code"
                autoComplete="one-time-code"
                inputMode="text"
                maxLength={12}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. 4F2A91C8D0"
              />
              <button disabled={busy || code.replace(/\s/g, '').length !== 10}>
                {busy ? 'Pairing…' : 'Connect'}
              </button>
            </div>
          </form>
          <p className="remote-message" role="status">
            {message}
          </p>
          <small className="remote-security-note">
            The code works once and expires with the filming session. Camera commands stay on this
            Hisaab server.
          </small>
        </section>
      ) : (
        <div className="remote-director-layout">
          <section className="remote-transport-card">
            <div className="remote-card-heading">
              <div>
                <span className="remote-overline">LIVE SESSION</span>
                <h1>Director controls</h1>
              </div>
              <button className="remote-disconnect" onClick={disconnect}>
                <Unplug size={15} />
                Unpair
              </button>
            </div>
            <p className="remote-message" role="status">
              {message}
            </p>
            <div className="remote-transport-actions">
              <button onClick={() => void send({ type: 'playback', action: 'replay' })}>
                <RotateCcw size={16} />
                Replay
              </button>
              <button onClick={() => void send({ type: 'playback', action: 'pause' })}>
                <Pause size={16} />
                Pause
              </button>
              <button onClick={() => void send({ type: 'playback', action: 'resume' })}>
                <Play size={16} />
                Resume
              </button>
              <button onClick={() => void send({ type: 'playback', action: 'stop' })}>
                <Square size={15} />
                Stop
              </button>
            </div>
            <div className="remote-transport-actions">
              <button onClick={() => void send({ type: 'preset', id: 'push' })}>
                <Plus size={16} />
                Push in
              </button>
              <button onClick={() => void send({ type: 'preset', id: 'pull' })}>
                <Minus size={16} />
                Pull out
              </button>
              <button onClick={() => void send({ type: 'demo' })}>
                <Map size={16} />
                Show demo card
              </button>
            </div>
            <div className="remote-transport-actions">
              <button onClick={() => void send({ type: 'visibility', card: 'show' })}>
                Show card
              </button>
              <button onClick={() => void send({ type: 'visibility', card: 'hide' })}>
                Map only
              </button>
              <button onClick={() => void send({ type: 'visibility', card: 'emphasis' })}>
                Card focus
              </button>
            </div>
            <div className="remote-transport-actions">
              <button onClick={() => void send({ type: 'look', theme: 'dark' })}>Night look</button>
              <button onClick={() => void send({ type: 'look', theme: 'light' })}>Day look</button>
              <button onClick={() => void send({ type: 'look', basemap: 'satellite' })}>
                Satellite
              </button>
              <button onClick={() => void send({ type: 'look', basemap: 'streets' })}>Map</button>
            </div>
          </section>
          <section className="remote-preset-card">
            <span className="remote-overline">CAMERA PRESETS</span>
            <h2>Choose the next shot</h2>
            {presetGroups.map((group) => (
              <div className="remote-preset-group" key={group}>
                <h3>{group}</h3>
                <div>
                  {contentPresets
                    .filter((p) => p[2] === group)
                    .map(([id, label, _, description]) => (
                      <button
                        key={id}
                        title={description}
                        onClick={() => void send({ type: 'preset', id })}
                      >
                        {label}
                      </button>
                    ))}
                </div>
              </div>
            ))}
            <div className="remote-preset-group">
              <h3>Play a sequence</h3>
              <div>
                <button
                  onClick={() => void send({ type: 'showcase', id: 'country-scale-receipt' })}
                >
                  <Globe2 size={14} />
                  Country → scale → receipt
                </button>
                <button onClick={() => void send({ type: 'showcase', id: 'location-story' })}>
                  <Radio size={14} />
                  Selected location story
                </button>
              </div>
            </div>
          </section>
          <section className="remote-card-card">
            <span className="remote-overline">CARD FRAMING</span>
            <h2>Frame what the viewer sees</h2>
            <div>
              {cardPresets.map(([id, label]) => (
                <button key={id} onClick={() => void send({ type: 'card', focus: id })}>
                  <Check size={13} />
                  {label}
                </button>
              ))}
            </div>
            <p>
              To keep controls out of the footage, leave this controller open here and close Content
              Mode on the filming tab. The paired camera listener stays active.
            </p>
          </section>
        </div>
      )}
      <footer className="remote-studio-footer">
        Hisaab Content Mode <span>·</span> Local paired camera control
      </footer>
    </main>
  );
}
