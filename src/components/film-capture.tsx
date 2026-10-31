'use client';
import { useEffect, useRef, useState } from 'react';
import type mapboxgl from 'mapbox-gl';
import type { AssetDetail } from '@/lib/asset-geography';
import type { Work } from '@/lib/model';
import type { ContentPresentation } from '@/lib/content-mode';
import { completeCardDemo } from '@/lib/complete-card-demo';
import { roadCardDemo } from '@/lib/road-card-demo';

type Props = {
  map: mapboxgl.Map | null;
  onAsset: (a: AssetDetail) => void;
  onWork: (w: Work) => void;
  onHome: () => void;
  onLayers: (historical: boolean) => void;
  onPresentation: (p: ContentPresentation) => void;
  onActivity: (v: boolean) => void;
};
const choices = [
  ['school', 'School', '1aa0b05c14e93701f110:8'],
  ['road', 'Road', '3ee86e5b6e685a5fe00c:16'],
  ['hospital', 'Hospital', '1aa0b05c14e93701f110:37'],
  ['railway', 'Railway', '1aa0b05c14e93701f110:14489'],
] as const;
export function FilmCapture(props: Props) {
  const [hidden, setHidden] = useState(false),
    [shot, setShot] = useState('india'),
    [status, setStatus] = useState('Ready'),
    [recording, setRecording] = useState(false);
  const latest = useRef(props);
  latest.current = props;
  const take = useRef('india'),
    busy = useRef(false),
    backdrop = useRef<HTMLImageElement | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const present = (focus: ContentPresentation['cardFocus'] = 'overview', clean = true) =>
    latest.current.onPresentation({
      frame: 'screen',
      clean,
      card: focus === 'overview' ? 'show' : 'emphasis',
      count: false,
      cardFocus: focus,
    });
  function country(dots: boolean) {
    const p = latest.current,
      m = p.map;
    if (!m) return;
    p.onHome();
    p.onActivity(true);
    p.onLayers(dots);
    present();
    m.fitBounds(
      [
        [67.8, 6.5],
        [97.5, 37.2],
      ],
      {
        padding: { top: 95, bottom: 60, left: 80, right: 80 },
        duration: 1100,
        pitch: 0,
        bearing: 0,
      },
    );
    take.current = dots ? 'dots' : 'india';
    setShot(take.current);
  }
  async function pick(id: string, name: string) {
    const p = latest.current,
      m = p.map;
    if (!m) return;
    setStatus('Loading ' + name);
    p.onActivity(true);
    p.onLayers(true);
    present();
    try {
      const r = await fetch('/api/v1/assets/' + encodeURIComponent(id));
      if (!r.ok) throw new Error('Record unavailable');
      const { asset } = (await r.json()) as { asset: AssetDetail };
      p.onAsset(asset);
      m.flyTo({
        center: asset.location,
        zoom: 15.4,
        pitch: 25,
        bearing: -12,
        padding: { top: 90, bottom: 60, left: 60, right: 520 },
        duration: 2200,
        essential: true,
      });
      take.current = name;
      setShot(name);
      setStatus('Ready');
    } catch (e) {
      setStatus(String(e));
    }
  }
  function demo() {
    const p = latest.current,
      m = p.map;
    if (!m) return;
    p.onActivity(true);
    p.onLayers(false);
    present();
    p.onWork(completeCardDemo);
    m.flyTo({
      center: completeCardDemo.location!,
      zoom: 16.1,
      pitch: 28,
      bearing: -14,
      padding: { top: 90, bottom: 60, left: 60, right: 520 },
      duration: 2400,
      essential: true,
    });
    take.current = 'showcase';
    setShot('showcase');
  }
  function detail(focus: ContentPresentation['cardFocus']) {
    present(focus);
    take.current = focus;
    setShot(focus);
  }
  function region() {
    const p = latest.current,
      m = p.map;
    if (!m) return;
    p.onHome();
    p.onActivity(true);
    p.onLayers(true);
    present();
    m.flyTo({
      center: [78.3, 25.2],
      zoom: 7.4,
      pitch: 20,
      bearing: 0,
      padding: { top: 75, bottom: 60, left: 75, right: 75 },
      duration: 3000,
      essential: true,
    });
    take.current = 'region';
    setShot('region');
  }
  function record() {
    const m = latest.current.map;
    if (!m || busy.current) return;
    const canvas = m.getCanvas();
    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
      setStatus('Canvas recording unavailable');
      return;
    }
    busy.current = true;
    setRecording(true);
    setStatus('Recording map');
    const output = document.createElement('canvas');
    output.width = canvas.width;
    output.height = canvas.height;
    const ctx = output.getContext('2d')!;
    const w = canvas.clientWidth,
      h = canvas.clientHeight,
      ratio = output.width / w;
    const bg = document.createElement('canvas');
    bg.width = output.width;
    bg.height = output.height;
    const bc = bg.getContext('2d')!;
    bc.scale(ratio, ratio);
    bc.fillStyle = '#c7d3d0';
    bc.fillRect(0, 0, w, h);
    const image = backdrop.current;
    if (image) {
      const scale = Math.max((w + 48) / image.width, (h + 48) / image.height);
      bc.filter = 'blur(12px) saturate(.72)';
      bc.drawImage(
        image,
        (w - image.width * scale) / 2,
        (h - image.height * scale) / 2,
        image.width * scale,
        image.height * scale,
      );
      bc.filter = 'none';
    }
    bc.fillStyle = '#122d3244';
    bc.fillRect(0, 0, w, h);
    const paint = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, 0, 0);
      ctx.save();
      ctx.scale(ratio, ratio);
      const path = canvas.style.clipPath.match(/^path\(evenodd,\s*"(.*)"\)$/)?.[1];
      if (path) {
        ctx.clip(new Path2D(path), 'evenodd');
        ctx.drawImage(canvas, 0, 0, w, h);
      }
      ctx.restore();
      ctx.save();
      ctx.scale(ratio, ratio);
      ctx.font = '700 31px system-ui';
      ctx.fillStyle = '#edf5e9';
      ctx.fillText('hisaab.', 38, 61);
      ctx.font = '10px system-ui';
      ctx.fillStyle = '#edf5e9';
      ctx.textAlign = 'right';
      ctx.fillText('India: Survey of India · Mapbox · OpenStreetMap · Maxar', w - 18, h - 18);
      ctx.restore();
    };
    m.on('render', paint);
    paint();
    const stream = output.captureStream(30);
    const chunks: BlobPart[] = [];
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((v) =>
      MediaRecorder.isTypeSupported(v),
    );
    const rec = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 18000000,
    });
    recorder.current = rec;
    const repaint = setInterval(() => m.triggerRepaint(), 33);
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      m.off('render', paint);
      clearInterval(repaint);
      stream.getTracks().forEach((t) => t.stop());
      const url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hisaab-' + take.current + '-' + Date.now() + '.webm';
      a.click();
      timers.current.push(setTimeout(() => URL.revokeObjectURL(url), 60000));
      busy.current = false;
      setRecording(false);
      setStatus('Map take saved');
    };
    rec.start(200);
    m.easeTo({
      zoom: m.getZoom() + 0.18,
      bearing: m.getBearing() + (m.getZoom() > 8 ? 12 : 0),
      duration: 6500,
      easing: (t) => t * t * (3 - 2 * t),
      essential: true,
    });
    timers.current.push(
      setTimeout(() => {
        if (rec.state === 'recording') rec.stop();
      }, 7000),
    );
  }
  async function recordScreen() {
    if (busy.current) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16000000 });
      const chunks: BlobPart[] = [];
      recorder.current = rec;
      busy.current = true;
      setRecording(true);
      setHidden(true);
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hisaab-road-report-screen-' + Date.now() + '.webm';
        a.click();
        timers.current.push(setTimeout(() => URL.revokeObjectURL(url), 60000));
        busy.current = false;
        setRecording(false);
        setStatus('Screen recording saved');
      };
      stream.getVideoTracks()[0].onended = () => {
        if (rec.state === 'recording') rec.stop();
      };
      rec.start(250);
    } catch (e) {
      setStatus('Screen recording: ' + String(e));
    }
  }
  function roadOverview() {
    country(true);
  }
  function roadShowcase() {
    const p = latest.current;
    p.onLayers(true);
    present();
    timers.current.push(setTimeout(() => p.onWork(roadCardDemo), 6500));
    p.map?.flyTo({
      center: roadCardDemo.location!,
      zoom: 16.5,
      pitch: 40,
      bearing: -12,
      padding: { top: 90, bottom: 60, left: 60, right: 520 },
      duration: 6500,
      essential: true,
    });
  }
  const commands = useRef({
    recordScreen,
    roadOverview,
    roadShowcase,
    country,
    pick,
    demo,
    detail,
    region,
    record,
    showUI: () => present('overview', false),
  });
  commands.current = {
    recordScreen,
    roadOverview,
    roadShowcase,
    country,
    pick,
    demo,
    detail,
    region,
    record,
    showUI: () => present('overview', false),
  };
  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      backdrop.current = image;
    };
    image.src = '/backgrounds/teal-rural-horizon.webp';
    const shell = document.querySelector<HTMLElement>('.atlas-shell');
    if (shell) shell.dataset.filming = 'true';
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input,textarea,select')) return;
      const c = commands.current;
      if (e.key.toLowerCase() === 'h') setHidden((v) => !v);
      else if (e.key === '1') c.country(false);
      else if (e.key === '2') c.country(true);
      else if (e.key === '3') void c.pick(choices[0][2], 'School');
      else if (e.key === '4') void c.pick(choices[1][2], 'Road');
      else if (e.key === '5') void c.pick(choices[2][2], 'Hospital');
      else if (e.key === '6') void c.pick(choices[3][2], 'Railway');
      else if (e.key === '7') c.demo();
      else if (e.key === '8') c.detail('payments');
      else if (e.key === '9') c.detail('people');
      else if (e.key === '0') c.region();
      else if (e.key.toLowerCase() === 'r') c.record();
      else if (e.key.toLowerCase() === 'd') {
        c.record();
        c.roadShowcase();
      } else if (e.key.toLowerCase() === 'm') c.detail('money');
      else if (e.key.toLowerCase() === 'c') c.showUI();
      else if (e.key.toLowerCase() === 'b') void c.recordScreen();
      else if (e.key.toLowerCase() === 's') {
        if (recorder.current?.state === 'recording') recorder.current.stop();
      } else if (e.key === '-') c.roadOverview();
      else if (e.key === '=') c.roadShowcase();
    };
    addEventListener('keydown', key);
    return () => {
      removeEventListener('keydown', key);
      if (shell) delete shell.dataset.filming;
      timers.current.forEach(clearTimeout);
      if (recorder.current?.state === 'recording') recorder.current.stop();
    };
  }, []);
  return (
    <div className="film-capture-tools" hidden={hidden} aria-label="Film capture controls">
      <strong>Film capture · {shot}</strong>
      <button onClick={() => void recordScreen()}>Record full tab</button>
      <button onClick={roadOverview}>Road intro</button>
      <button
        onClick={() => {
          record();
          roadShowcase();
        }}
      >
        Record road dive
      </button>
      <button onClick={roadShowcase}>Open road showcase</button>
      <div>
        <button onClick={() => country(false)}>1 India</button>
        <button onClick={() => country(true)}>2 Assets</button>
        {choices.map(([key, name, id], i) => (
          <button key={key} onClick={() => void pick(id, name)}>
            {i + 3} {name}
          </button>
        ))}
        <button onClick={demo}>7 Showcase</button>
        <button onClick={() => detail('money')}>Money</button>
        <button onClick={() => detail('timeline')}>Timeline</button>
        <button onClick={() => detail('payments')}>8 Payments</button>
        <button onClick={() => detail('people')}>9 Recipient</button>
        <button onClick={region}>0 Region</button>
        <button disabled={recording || !props.map} onClick={record}>
          {recording ? 'Recording…' : 'R Record 7s map'}
        </button>
      </div>
      <small>{status} · H hides tools</small>
    </div>
  );
}
