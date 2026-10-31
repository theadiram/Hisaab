'use client';
import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Work } from '@/lib/model';
import type { MapPoints } from '@/lib/map-clusters';
import type { FundingOverview } from '@/lib/funding';
import { FundingMapLayer } from './funding-map-layer';
import { AssetMapLayer } from './asset-map-layer';
import { MapLayerControls } from './map-layer-controls';
import { Compass, LocateFixed, Minus, Plus, X, MapPin } from 'lucide-react';
export function EvidenceMap({
  works,
  selected,
  onSelect,
  demo = false,
  query = '',
  purpose = 'All',
  year = 'All years',
  funding,
}: {
  works: Work[];
  selected: Work | null;
  onSelect: (work: Work) => void;
  demo?: boolean;
  query?: string;
  purpose?: string;
  year?: string;
  funding?: {
    states: FundingOverview['states'];
    selected: string | null;
    onSelect: (code: string) => void;
    onAssetOpen: () => void;
  };
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false),
    [showAssets, setShowAssets] = useState(() => {
      try {
        return (
          typeof window === 'undefined' ||
          localStorage.getItem('hisaab:historical-assets') !== 'off'
        );
      } catch {
        return true;
      }
    });
  const [showFunding, setShowFunding] = useState(() => {
    try {
      return (
        typeof window === 'undefined' || localStorage.getItem('hisaab:funding-layer') !== 'off'
      );
    } catch {
      return true;
    }
  });
  const [error, setError] = useState('');
  const [atlasOverview, setAtlasOverview] = useState(true);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [lighting, setLighting] = useState<'day' | 'dusk' | 'night'>('dusk');
  const [basemap, setBasemap] = useState<'streets' | 'satellite'>('streets');
  const [terrain, setTerrain] = useState(false);
  const [styleBusy, setStyleBusy] = useState(false);
  const [tilted, setTilted] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [viewport, setViewport] = useState<number[] | null>(null);
  const [points, setPoints] = useState<MapPoints | null>(null);
  const [pointStatus, setPointStatus] = useState('Loading published work locations…');
  const [group, setGroup] = useState<number[] | null>(null),
    [offset, setOffset] = useState(0),
    [members, setMembers] = useState<{
      total: number;
      works: { id: string; title: string; purpose: string }[];
    } | null>(null),
    [memberStatus, setMemberStatus] = useState('');
  const receiptRequest = useRef(0);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  useEffect(() => {
    if (!container.current) return;
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
      if (!token || !token.startsWith('pk.')) {
        setError('Mapbox is not configured. The evidence list remains available.');
        return;
      }
      const m = new mapboxgl.Map({
        container: container.current,
        accessToken: token,
        style: {
          version: 8,
          sources: {},
          layers: [],
          imports: [
            {
              id: 'basemap',
              url: 'mapbox://styles/mapbox/standard',
              config: { lightPreset: 'dusk', showPointOfInterestLabels: false },
            },
          ],
        },
        language: 'en',
        worldview: 'IN',
        projection: 'mercator',
        transformRequest: (url) => ({
          url,
          referrerPolicy: url.startsWith('https://api.mapbox.com/')
            ? 'strict-origin-when-cross-origin'
            : 'no-referrer',
        }),
        center: [79.8, 22.5],
        zoom: 4.1,
        minZoom: 3.5,
        maxZoom: 18,
        renderWorldCopies: false,
        attributionControl: true,
        logoPosition: 'bottom-right',
      });
      map.current = m;
      let constrainingCentre = false;
      const updateBounds = () => {
        const c = m.getCenter();
        const lng = Math.max(55, Math.min(110, c.lng)),
          lat = Math.max(-5, Math.min(45, c.lat));
        if (!constrainingCentre && (Math.abs(lng - c.lng) > 0.01 || Math.abs(lat - c.lat) > 0.01)) {
          constrainingCentre = true;
          try {
            m.jumpTo({ center: [lng, lat] });
          } finally {
            constrainingCentre = false;
          }
        }
        setAtlasOverview(m.getZoom() < 7);
        const b = m.getBounds();
        if (!b) return;
        const west = Math.max(-180, b.getWest()),
          east = Math.min(180, b.getEast()),
          south = Math.max(-90, b.getSouth()),
          north = Math.min(90, b.getNorth());
        if (west < east && south < north) setViewport([west, south, east, north]);
      };
      m.on('moveend', updateBounds);
      m.on('load', updateBounds);
      m.on('pitchend', () => setTilted(m.getPitch() > 10));
      m.on('load', () => {
        setStyleBusy(false);
        setBasemap('streets');
        setLighting('dusk');
        m.addSource('hisaab-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });
        m.addSource('hisaab-india-display', {
          type: 'geojson',
          data: '/geography/india-display.geojson',
          attribution:
            '<a href="https://surveyofindia.gov.in/pages/outline-maps-of-india">India outline: Survey of India</a>',
        });
        m.addLayer({
          id: 'hisaab-india-clip',
          type: 'clip',
          source: 'hisaab-india-display',
          filter: ['==', ['get', 'role'], 'outside'],
          layout: { 'clip-layer-types': ['model', 'symbol'], 'clip-layer-scope': ['basemap'] },
        });
        m.addLayer({
          id: 'hisaab-outside-india',
          type: 'fill',
          source: 'hisaab-india-display',
          filter: ['==', ['get', 'role'], 'outside'],
          paint: { 'fill-color': '#101e2c', 'fill-opacity': 1, 'fill-emissive-strength': 1 },
        });
        m.addLayer({
          id: 'hisaab-atlas-grid',
          type: 'line',
          source: 'hisaab-india-display',
          filter: ['==', ['get', 'role'], 'grid'],
          maxzoom: 8,
          paint: {
            'line-color': '#8ea49b',
            'line-width': 0.7,
            'line-opacity': 0.13,
            'line-emissive-strength': 1,
          },
        });
        m.addLayer({
          id: 'hisaab-india-glow',
          type: 'line',
          source: 'hisaab-india-display',
          filter: ['==', ['get', 'role'], 'outline'],
          maxzoom: 8,
          paint: {
            'line-color': '#a5f34b',
            'line-width': 10,
            'line-blur': 6,
            'line-opacity': 0.075,
            'line-emissive-strength': 1,
          },
        });
        m.addLayer({
          id: 'hisaab-india-outline',
          type: 'line',
          source: 'hisaab-india-display',
          filter: ['==', ['get', 'role'], 'outline'],
          paint: {
            'line-color': '#b9d695',
            'line-width': 1,
            'line-opacity': 0.65,
            'line-emissive-strength': 1,
          },
        });
        m.setMinZoom(0);
        m.fitBounds(
          [
            [67.8, 6.5],
            [97.5, 37.2],
          ],
          { padding: indiaPadding(), duration: 0 },
        );
        m.setMinZoom(m.getZoom());
        setMapReady(true);
      });
      m.on('error', (e) => {
        const status = (e.error as Error & { status?: number })?.status;
        if (status === 401 || status === 403) {
          setStyleBusy(false);
          setError(
            'Mapbox denied this map request. Check token permissions, allowed URLs and account access.',
          );
        } else if (e.error?.message?.includes('Failed to fetch'))
          setError('Map connection unavailable. The evidence list remains usable.');
      });
      return () => {
        m.remove();
        map.current = null;
      };
    } catch {
      setError('This device cannot render the map. Explore through the work list.');
    }
  }, []);
  useEffect(() => {
    if (funding || demo || !viewport) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPointStatus('Loading published work locations…');
      setPoints(null);
      const params = new URLSearchParams({ bbox: viewport.join(','), q: query });
      if (purpose !== 'All') params.set('purpose', purpose);
      if (year !== 'All years') params.set('year', year);
      void fetch('/api/v1/map/works?' + params, { signal: controller.signal })
        .then(async (r) => {
          if (!r.ok)
            throw new Error('Work locations could not be loaded. Try moving the map to retry.');
          const result = (await r.json()) as MapPoints;
          if (!controller.signal.aborted) {
            setPoints(result);
            setPointStatus(
              result.total
                ? `${result.total.toLocaleString('en-IN')} published works in this view · click a dot for evidence`
                : 'No published works with verified locations in this view. Collection and location review are in progress.',
            );
          }
        })
        .catch((e) => {
          if (e.name !== 'AbortError') {
            setPoints(null);
            setPointStatus(e.message);
          }
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [viewport, demo, query, purpose, year, !!funding]);
  useEffect(() => {
    if (!map.current) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const entries = funding
      ? []
      : demo
        ? works
            .filter((w) => w.location)
            .map((w) => ({
              location: w.location!,
              label: `Open ${w.title} — illustrative work`,
              text: w.purpose === 'Water' ? 'W' : 'R',
              cluster: false,
              click: () => selectRef.current(w),
            }))
        : (points?.features ?? []).map((f) => ({
            location: f.geometry.coordinates,
            label: f.properties.cluster
              ? `Open group of ${f.properties.count} nearby works`
              : `Open ${f.properties.title}`,
            text: f.properties.cluster ? f.properties.count.toLocaleString('en-IN') : '•',
            cluster: f.properties.cluster,
            click: () => {
              if (f.properties.cluster) {
                const b = f.properties.bounds!;
                setOffset(0);
                setGroup([
                  Math.max(-180, b[0] - 0.000001),
                  Math.max(-90, b[1] - 0.000001),
                  Math.min(180, b[2] + 0.000001),
                  Math.min(90, b[3] + 0.000001),
                ]);
                return;
              }
              void openWork(f.properties.id!);
            },
          }));
    markers.current = entries.map((entry) => {
      const button = document.createElement('button');
      button.className = `work-marker ${entry.cluster ? 'work-cluster' : ''}`;
      button.setAttribute('aria-label', entry.label);
      button.textContent = entry.text;
      button.addEventListener('click', entry.click);
      return new mapboxgl.Marker({ element: button }).setLngLat(entry.location).addTo(map.current!);
    });
  }, [works, demo, points, !!funding]);
  async function openWork(id: string) {
    const request = ++receiptRequest.current;
    setPointStatus('Loading the original work receipt…');
    try {
      const response = await fetch('/api/v1/works/' + encodeURIComponent(id));
      if (!response.ok) throw new Error('This receipt is unavailable or has been withdrawn.');
      const result = await response.json();
      if (request !== receiptRequest.current) return;
      selectRef.current(result.work);
      setGroup(null);
      setPointStatus(
        'Work receipt opened. Amounts and completion depend on the attached evidence.',
      );
    } catch (e) {
      if (request === receiptRequest.current) setPointStatus((e as Error).message);
    }
  }
  useEffect(() => {
    setGroup(null);
  }, [query, purpose, year, demo]);
  useEffect(() => {
    if (!group) return;
    const controller = new AbortController();
    setMembers(null);
    setMemberStatus('Loading works in this group…');
    const params = new URLSearchParams({
      bbox: group.join(','),
      mode: 'members',
      offset: String(offset),
      q: query,
    });
    if (purpose !== 'All') params.set('purpose', purpose);
    if (year !== 'All years') params.set('year', year);
    void fetch('/api/v1/map/works?' + params, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            'Group receipts could not be loaded. Close and reopen the group to retry.',
          );
        const result = await r.json();
        if (!controller.signal.aborted) {
          setMembers(result);
          setMemberStatus('');
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setMemberStatus(e.message);
      });
    return () => controller.abort();
  }, [group, offset, query, purpose, year]);
  useEffect(() => {
    if (selected?.location && map.current)
      map.current.flyTo({
        center: selected.location,
        zoom: tilted ? 16 : 12,
        pitch: tilted ? 55 : 0,
        padding: {
          left: window.innerWidth > 900 ? 430 : 0,
          right: window.innerWidth > 1200 ? 390 : 0,
          bottom: window.innerWidth < 900 ? 330 : 0,
          top: 120,
        },
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1100,
      });
  }, [selected, tilted]);
  useEffect(() => {
    if (funding && mapReady) showIndia();
  }, [!!funding, mapReady]);
  function changeLighting(value: 'day' | 'dusk' | 'night') {
    const m = map.current;
    if (!m || !mapReady) return;
    m.setConfigProperty('basemap', 'lightPreset', value);
    m.setPaintProperty(
      'hisaab-outside-india',
      'fill-color',
      value === 'day' ? '#e9eff1' : value === 'night' ? '#09121c' : '#101e2c',
    );
    setLighting(value);
  }
  function changeBasemap(value: 'streets' | 'satellite') {
    const m = map.current;
    if (!m || !mapReady || styleBusy || value === basemap) return;
    const style = m.getStyle();
    if (!style) return;
    setStyleBusy(true);
    setError('');
    m.once('style.load', () => {
      setBasemap(value);
      setStyleBusy(false);
    });
    m.setStyle(
      {
        ...style,
        imports: [
          {
            id: 'basemap',
            url:
              value === 'satellite'
                ? 'mapbox://styles/mapbox/standard-satellite'
                : 'mapbox://styles/mapbox/standard',
            config: { lightPreset: lighting, showPointOfInterestLabels: false },
          },
        ],
      },
      { diff: false, localFontFamily: undefined, localIdeographFontFamily: undefined },
    );
  }
  function toggleTerrain() {
    const m = map.current;
    if (!m || !mapReady) return;
    m.setTerrain(terrain ? null : { source: 'hisaab-dem', exaggeration: 1 });
    setTerrain(!terrain);
  }
  function indiaPadding() {
    if (funding)
      return {
        top: innerWidth < 760 ? 110 : 100,
        bottom:
          innerWidth < 760 ? Math.round((container.current?.clientHeight ?? 600) * 0.43) + 20 : 80,
        left: innerWidth > 900 ? 380 : 15,
        right: innerWidth < 760 ? 65 : 85,
      };
    return {
      top: innerWidth < 760 ? 245 : 180,
      bottom: innerWidth < 760 ? 330 : 170,
      left: innerWidth > 900 ? 405 : 15,
      right: innerWidth < 760 ? 65 : 85,
    };
  }
  function showIndia() {
    const m = map.current;
    if (!m) return;
    m.setMinZoom(0);
    m.fitBounds(
      [
        [67.8, 6.5],
        [97.5, 37.2],
      ],
      {
        padding: indiaPadding(),
        pitch: 0,
        bearing: 0,
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700,
      },
    );
    m.once('moveend', () => m.setMinZoom(m.getZoom()));
  }
  function locate() {
    if (!navigator.geolocation) {
      setLocationMessage('Location is unavailable. Search a place instead.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (
          p.coords.longitude < 67 ||
          p.coords.longitude > 98 ||
          p.coords.latitude < 6 ||
          p.coords.latitude > 38
        ) {
          setLocationMessage(
            'Your location is outside the India map. Search an Indian place instead.',
          );
          return;
        }
        map.current?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 11 });
        setLocationMessage('Showing your location; work pins require source evidence.');
      },
      () => setLocationMessage('Location permission unavailable. You can still search any place.'),
    );
  }
  return (
    <div
      className="map-surface"
      data-map-provider="mapbox"
      data-map-lighting={lighting}
      data-map-style={basemap}
      data-funding-layer={funding && showFunding ? 'on' : 'off'}
    >
      <div ref={container} className="map-canvas" />
      <div className="map-grain" />
      {atlasOverview && (
        <div className="atlas-signature" aria-hidden="true">
          <span className="atlas-index">01 / NATIONAL VIEW</span>
          <strong>INDIA</strong>
          <span>DEVELOPMENT ATLAS</span>
          <i />
          <small>{funding ? 'Union funding · state by state' : 'Every dot has a source.'}</small>
        </div>
      )}
      {mapReady && map.current && (
        <FundingMapLayer
          map={map.current}
          active={!!funding && showFunding}
          states={funding?.states ?? []}
          selected={funding?.selected ?? null}
          onSelect={funding?.onSelect}
        />
      )}{' '}
      {mapReady && (
        <button
          className="mobile-appearance-toggle"
          aria-expanded={appearanceOpen}
          aria-controls="map-appearance"
          onClick={() => setAppearanceOpen((v) => !v)}
        >
          Map style <span>{appearanceOpen ? '−' : '+'}</span>
        </button>
      )}
      {mapReady && (
        <div
          id="map-appearance"
          className={`map-appearance ${appearanceOpen ? 'is-open' : ''}`}
          aria-label="Map appearance"
        >
          <div className="appearance-segment" aria-label="Basemap">
            <button
              aria-pressed={basemap === 'streets'}
              disabled={styleBusy}
              onClick={() => changeBasemap('streets')}
            >
              Map
            </button>
            <button
              aria-pressed={basemap === 'satellite'}
              disabled={styleBusy}
              onClick={() => changeBasemap('satellite')}
            >
              Satellite
            </button>
          </div>
          <div className="appearance-segment" aria-label="Map lighting">
            {(['day', 'dusk', 'night'] as const).map((value) => (
              <button
                key={value}
                aria-label={`Map lighting: ${value}`}
                aria-pressed={lighting === value}
                disabled={styleBusy}
                onClick={() => changeLighting(value)}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <button
            className="terrain-toggle"
            aria-pressed={terrain}
            disabled={styleBusy}
            onClick={toggleTerrain}
          >
            Terrain {terrain ? 'On' : 'Off'}
          </button>
          {styleBusy && <small role="status">Loading map imagery…</small>}
        </div>
      )}
      {mapReady && viewport && map.current && (!demo || !!funding) && (
        <AssetMapLayer
          map={map.current}
          viewport={viewport}
          visible={showAssets}
          query={funding ? '' : query}
          purpose={funding ? 'All' : purpose}
          workSelected={!!selected || !!funding?.selected}
          onOpen={funding?.onAssetOpen}
        />
      )}
      {(!demo || !!funding) && (
        <MapLayerControls
          fundingAvailable={!!funding}
          fundingVisible={showFunding}
          assetsVisible={showAssets}
          onFundingChange={(next) => {
            setShowFunding(next);
            try {
              localStorage.setItem('hisaab:funding-layer', next ? 'on' : 'off');
            } catch {}
          }}
          onAssetsChange={(next) => {
            setShowAssets(next);
            try {
              localStorage.setItem('hisaab:historical-assets', next ? 'on' : 'off');
            } catch {}
          }}
        />
      )}
      {!funding && group && (
        <aside className="map-members" aria-label="Works in map group">
          <button
            className="icon-button"
            aria-label="Close map group"
            onClick={() => setGroup(null)}
          >
            <X size={18} />
          </button>
          <h2>Works in this group</h2>
          <p>Grouped dots represent nearby works, not a single spending location.</p>
          {memberStatus && <p role="status">{memberStatus}</p>}
          {members && (
            <>
              <small>
                {members.total.toLocaleString('en-IN')} published works · {offset + 1}–
                {Math.min(offset + 25, members.total)}
              </small>
              {members.works.map((w) => (
                <button className="map-member" key={w.id} onClick={() => void openWork(w.id)}>
                  <strong>{w.title}</strong>
                  <small>{w.purpose} · Open receipt</small>
                </button>
              ))}
              <div className="detail-actions">
                <button disabled={!offset} onClick={() => setOffset((n) => Math.max(0, n - 25))}>
                  Previous works
                </button>
                <button
                  disabled={offset + 25 >= members.total}
                  onClick={() => setOffset((n) => n + 25)}
                >
                  Next works
                </button>
              </div>
              <button
                className="secondary full"
                onClick={() => {
                  map.current?.fitBounds(
                    [
                      [group[0], group[1]],
                      [group[2], group[3]],
                    ],
                    {
                      padding: 80,
                      maxZoom: 18,
                      duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500,
                    },
                  );
                  setGroup(null);
                }}
              >
                Zoom to this group
              </button>
            </>
          )}
        </aside>
      )}
      {error && (
        <div className="map-error" role="status">
          {error}
        </div>
      )}
      <div className="map-tools">
        <button aria-label="Show all India" title="Show all India" onClick={showIndia}>
          <MapPin size={19} />
        </button>
        <span />
        <button aria-label="Zoom in" onClick={() => map.current?.zoomIn()}>
          <Plus size={19} />
        </button>
        <button aria-label="Zoom out" onClick={() => map.current?.zoomOut()}>
          <Minus size={19} />
        </button>
        <span />
        <button aria-label="Reset map north" onClick={() => map.current?.resetNorth()}>
          <Compass size={21} />
        </button>
        <button aria-label="Find my location" onClick={locate}>
          <LocateFixed size={20} />
        </button>
        <span />
        <button
          aria-label="Toggle perspective"
          className={tilted ? 'active' : ''}
          onClick={() => {
            map.current?.easeTo({ pitch: tilted ? 0 : 45 });
            setTilted(!tilted);
          }}
        >
          {tilted ? '2D' : '3D'}
        </button>
      </div>
      {locationMessage && (
        <p className="location-notice" role="status">
          {locationMessage}
        </p>
      )}
      {!funding && (
        <div className="map-note" role="status">
          <span className="dot" />
          {demo ? 'Illustrative works · fictional locations and amounts' : pointStatus}
        </div>
      )}
    </div>
  );
}
