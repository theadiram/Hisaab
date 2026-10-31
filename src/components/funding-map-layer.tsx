'use client';
import { useEffect, useRef, useState } from 'react';
import type mapboxgl from 'mapbox-gl';
import type { FundingOverview } from '@/lib/funding';
import { loadMapBoundary } from '@/lib/map-boundaries';
const source = 'hisaab-funding-states',
  fill = 'hisaab-funding-fill',
  line = 'hisaab-funding-border';
export function FundingMapLayer({
  map,
  active,
  states,
  selected,
  onSelect,
  showAmounts = true,
}: {
  map: mapboxgl.Map;
  active: boolean;
  states: FundingOverview['states'];
  selected: string | null;
  onSelect?: (code: string) => void;
  showAmounts?: boolean;
}) {
  const [error, setError] = useState(''),
    [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null),
    select = useRef(onSelect),
    values = useRef(states),
    choice = useRef(selected),
    enabled = useRef(active);
  select.current = onSelect;
  values.current = states;
  choice.current = selected;
  enabled.current = active;
  useEffect(() => {
    if (!active) {
      setHover(null);
      const hide = () => {
        if (!map.getStyle()) return;
        for (const id of [fill, line])
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
      };
      hide();
      map.on('style.load', hide);
      return () => {
        map.off('style.load', hide);
      };
    }
    const controller = new AbortController();
    let geometry: GeoJSON.FeatureCollection | null = null;
    function paint() {
      if (!map.getStyle() || !map.getLayer(fill)) return;
      const amounts = values.current
        .filter((s) => s.amountRupees !== null)
        .map((s) => Number(s.amountRupees));
      const ceiling = Math.max(1, ...amounts);
      const colours: unknown[] = ['match', ['get', 'code']];
      for (const state of values.current) {
        colours.push(
          state.code,
          state.amountRupees === null
            ? '#c5d2df'
            : Number(state.amountRupees) > ceiling * 0.7
              ? '#245ab9'
              : Number(state.amountRupees) > ceiling * 0.35
                ? '#6b99de'
                : '#c3d8f4',
        );
      }
      colours.push('#c5d2df');
      map.setPaintProperty(fill, 'fill-color', colours as mapboxgl.Expression);
      map.setPaintProperty(fill, 'fill-opacity', showAmounts ? 0.28 : 0.001);
      map.setPaintProperty(line, 'line-width', [
        'case',
        ['==', ['get', 'code'], choice.current ?? ''],
        2.8,
        0.8,
      ]);
      map.setPaintProperty(line, 'line-color', [
        'case',
        ['==', ['get', 'code'], choice.current ?? ''],
        '#205cff',
        '#f6f9fd',
      ]);
    }
    function install() {
      if (controller.signal.aborted || !geometry || !map.getStyle()) return;
      const before =
        map
          .getStyle()
          ?.layers?.find(
            (l) => l.id.startsWith('hisaab-individual-assets-') && l.id.endsWith('-dots'),
          )?.id ?? 'hisaab-outside-india';
      if (!map.getSource(source))
        map.addSource(source, {
          type: 'geojson',
          data: geometry,
          attribution:
            'State polygons: <a href="https://www.geoboundaries.org/">geoBoundaries / DataMeet</a> · <a href="https://creativecommons.org/licenses/by/2.5/in/">CC BY 2.5 IN</a>',
        });
      if (!map.getLayer(fill))
        map.addLayer(
          { id: fill, type: 'fill', source, paint: { 'fill-emissive-strength': 1 } },
          before,
        );
      if (!map.getLayer(line))
        map.addLayer(
          { id: line, type: 'line', source, paint: { 'line-emissive-strength': 1 } },
          before,
        );
      for (const id of [fill, line]) map.setLayoutProperty(id, 'visibility', 'visible');
      paint();
    }
    const click = (e: mapboxgl.MapMouseEvent) => {
      if (!enabled.current || !map.getLayer(fill)) return;
      if (
        map.getLayer('hisaab-asset-overview-circles') &&
        map.queryRenderedFeatures(e.point, { layers: ['hisaab-asset-overview-circles'] }).length
      )
        return;
      if (
        map.getLayer('hisaab-reviewed-projects-dots') &&
        map.queryRenderedFeatures(
          [
            [e.point.x - 6, e.point.y - 6],
            [e.point.x + 6, e.point.y + 6],
          ],
          { layers: ['hisaab-reviewed-projects-dots'] },
        ).length
      )
        return;
      const dots =
        map
          .getStyle()
          ?.layers?.filter(
            (l) => l.id.startsWith('hisaab-individual-assets-') && l.id.endsWith('-dots'),
          )
          .map((l) => l.id) ?? [];
      if (
        dots.length &&
        map.queryRenderedFeatures(
          [
            [e.point.x - 6, e.point.y - 6],
            [e.point.x + 6, e.point.y + 6],
          ],
          { layers: dots },
        ).length
      )
        return;
      const features = map.queryRenderedFeatures(e.point, { layers: [fill] });
      const code = features[0]?.properties?.code;
      if (typeof code === 'string') select.current?.(code);
    };
    const move = (e: mapboxgl.MapMouseEvent) => {
      if (map.getLayer(fill)) {
        const feature = map.queryRenderedFeatures(e.point, { layers: [fill] })[0];
        map.getCanvas().style.cursor = feature ? 'pointer' : '';
        setHover(
          feature
            ? {
                name:
                  values.current.find((s) => s.code === feature.properties?.code)?.name ??
                  feature.properties?.name ??
                  'State funding',
                x: e.point.x,
                y: e.point.y,
              }
            : null,
        );
      }
    };
    const canvas = map.getCanvas(),
      canvasContainer = map.getCanvasContainer(),
      leave = () => {
        setHover(null);
        canvas.style.cursor = '';
      };
    canvasContainer?.addEventListener('mouseleave', leave);
    void loadMapBoundary('states')
      .then((result) => {
        if (controller.signal.aborted) return;
        geometry = result;
        setError('');
        install();
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    map.on('style.load', install);
    map.on('click', click);
    map.on('mousemove', move);
    const update = () => {
      paint();
    };
    map.on('hisaab-funding-update' as 'idle', update);
    return () => {
      controller.abort();
      map.off('style.load', install);
      map.off('click', click);
      map.off('mousemove', move);
      map.off('hisaab-funding-update' as 'idle', update);
      canvasContainer?.removeEventListener('mouseleave', leave);
      leave();
      if (!map.getStyle()) return;
      if (map.getLayer(line)) map.removeLayer(line);
      if (map.getLayer(fill)) map.removeLayer(fill);
      if (map.getSource(source)) map.removeSource(source);
    };
  }, [map, active, showAmounts]);
  useEffect(() => {
    if (!map.getStyle()) return;
    map.fire('hisaab-funding-update');
    if (map.getLayer(line))
      map.setPaintProperty(line, 'line-width', [
        'case',
        ['==', ['get', 'code'], selected ?? ''],
        2.8,
        0.8,
      ]);
  }, [map, states, selected]);
  return active ? (
    <>
      {error && (
        <p className="funding-boundary-note" role="status">
          {error}
        </p>
      )}
      {hover && (
        <div className="funding-map-hover" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          {hover.name}
        </div>
      )}
    </>
  ) : null;
}
