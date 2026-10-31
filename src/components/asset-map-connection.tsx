'use client';
import { useEffect, useRef } from 'react';
import type mapboxgl from 'mapbox-gl';
// One screen-space connector for any selection. It follows the source coordinate,
// never a fabricated campus rectangle or inferred building footprint.
export function AssetMapConnection({
  map,
  location,
}: {
  map: mapboxgl.Map;
  location: [number, number] | null;
}) {
  const svg = useRef<SVGSVGElement>(null),
    path = useRef<SVGPathElement>(null),
    start = useRef<SVGCircleElement>(null),
    end = useRef<SVGCircleElement>(null);
  useEffect(() => {
    if (!location || !svg.current) return;
    const root = svg.current,
      container = map.getContainer();
    let frame = 0;
    const update = () => {
      const card = container.closest('.atlas-shell')?.querySelector('[data-asset-card]');
      if (!card) {
        root.style.opacity = '0';
        return;
      }
      const box = container.getBoundingClientRect(),
        r = card.getBoundingClientRect(),
        p = map.project(location);
      const mobile = box.width <= 760,
        x = mobile ? r.left - box.left + r.width / 2 : r.left - box.left,
        y = mobile ? r.top - box.top : r.top - box.top + Math.min(170, r.height * 0.3);
      const covered =
        p.x >= r.left - box.left &&
        p.x <= r.right - box.left &&
        p.y >= r.top - box.top &&
        p.y <= r.bottom - box.top;
      if (
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.y < 0 ||
        p.x > box.width ||
        p.y > box.height ||
        covered
      ) {
        root.style.opacity = '0';
        return;
      }
      root.style.opacity = '1';
      root.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      const d = mobile
        ? `M${p.x},${p.y} C${p.x},${p.y + 40} ${x},${y - 40} ${x},${y}`
        : `M${p.x},${p.y} C${p.x + 55},${p.y} ${x - 65},${y} ${x},${y}`;
      path.current?.setAttribute('d', d);
      for (const [circle, cx, cy] of [
        [start.current, p.x, p.y],
        [end.current, x, y],
      ] as const) {
        circle?.setAttribute('cx', String(cx));
        circle?.setAttribute('cy', String(cy));
      }
    };
    const observer = new ResizeObserver(update);
    observer.observe(container);
    const card = container.closest('.atlas-shell')?.querySelector('[data-asset-card]');
    if (card) observer.observe(card);
    map.on('render', update);
    update();
    // Follow the interruptible card entrance even if the map is otherwise idle.
    const until = performance.now() + 500;
    const enter = () => {
      update();
      if (performance.now() < until) frame = requestAnimationFrame(enter);
    };
    frame = requestAnimationFrame(enter);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      map.off('render', update);
      root.style.opacity = '0';
    };
  }, [map, location]);
  return (
    <svg ref={svg} className="asset-map-connection" aria-hidden="true">
      <path ref={path} />
      <circle ref={start} r="5" />
      <circle ref={end} r="4" />
    </svg>
  );
}
