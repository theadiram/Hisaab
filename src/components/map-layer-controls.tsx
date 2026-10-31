'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Layers, MapPin } from 'lucide-react';

export function MapLayerControls({
  fundingAvailable,
  fundingVisible,
  assetsVisible,
  onFundingChange,
  onAssetsChange,
}: {
  fundingAvailable: boolean;
  fundingVisible: boolean;
  assetsVisible: boolean;
  onFundingChange: (visible: boolean) => void;
  onAssetsChange: (visible: boolean) => void;
}) {
  const [open, setOpen] = useState(false),
    [count, setCount] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/v1/map/assets?bbox=-180,-90,180,90&mode=count', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json();
        if (Number.isSafeInteger(result.total) && result.total >= 0) setCount(result.total);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const active = (fundingAvailable && fundingVisible ? 1 : 0) + (assetsVisible ? 1 : 0);
  return (
    <div ref={root} className="map-layer-control">
      <button
        ref={trigger}
        className="map-layer-trigger"
        aria-expanded={open}
        aria-controls="map-layer-options"
        onClick={() => setOpen((v) => !v)}
      >
        <Layers size={16} />
        <span>Map layers</span>
        <small>{active} on</small>
      </button>
      {open && (
        <div
          id="map-layer-options"
          className="map-layer-options"
          role="group"
          aria-label="Choose map layers"
        >
          <p>Choose what the map shows</p>
          {fundingAvailable && (
            <button
              className="funding-layer-toggle"
              aria-pressed={fundingVisible}
              onClick={() => onFundingChange(!fundingVisible)}
            >
              <span className="layer-symbol layer-funding">
                <Layers size={18} />
              </span>
              <span>
                <strong>Funding by state</strong>
                <small>Reviewed Union funding · state colours</small>
              </span>
              <span className="layer-check">{fundingVisible ? <Check size={16} /> : null}</span>
            </button>
          )}
          <button
            className="asset-layer-toggle"
            aria-pressed={assetsVisible}
            onClick={() => onAssetsChange(!assetsVisible)}
          >
            <span className="layer-symbol layer-locations">
              <MapPin size={18} />
            </span>
            <span>
              <strong>Historical locations</strong>
              <small>
                {count === null
                  ? 'Archived locations'
                  : count.toLocaleString('en-IN') + ' individual dots'}{' '}
                · spending not linked
              </small>
            </span>
            <span className="layer-check">{assetsVisible ? <Check size={16} /> : null}</span>
          </button>
          <small className="map-layer-hint">
            {fundingAvailable
              ? 'Choose either layer, or show both together.'
              : 'Historical locations stay separate from published project receipts.'}
          </small>
        </div>
      )}
    </div>
  );
}
