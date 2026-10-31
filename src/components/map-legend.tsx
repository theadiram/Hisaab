'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Info, Layers, X } from 'lucide-react';

export interface MapLegendProps {
  layers: {
    funding: boolean;
    projects: boolean;
    historical: boolean;
  };
  year: string;
  purpose: string;
  onOpenLayers?: () => void;
}

export function MapLegend({
  layers,
  year,
  purpose,
  onOpenLayers,
}: MapLegendProps) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [expanded]);

  const activeCount =
    (layers.funding ? 1 : 0) +
    (layers.projects ? 1 : 0) +
    (layers.historical ? 1 : 0);

  const displayYear = year.length >= 8 ? `FY ${year.slice(0, 4)}–${year.slice(-2)}` : year;

  return (
    <div
      ref={containerRef}
      className={`atlas-legend-container ${expanded ? 'is-expanded' : ''}`}
      role="region"
      aria-label="Map layer legend and explanation"
    >
      <div className="atlas-legend">
        {layers.projects && (
          <span className="atlas-legend-item" title="Audited projects with sanction, bill, or completion receipts">
            <i className="key-project" aria-hidden="true" />
            <span>Reviewed projects</span>
          </span>
        )}
        {layers.historical && (
          <span className="atlas-legend-item" title="812,976 archived 2022 facility coordinates. Not linked to annual spending.">
            <i className="key-history" aria-hidden="true" />
            <span>Archived locations <small className="legend-sub">(not yearly spending)</small></span>
          </span>
        )}
        {layers.funding && (
          <span className="atlas-legend-item" title="Union funding allocated or released to states">
            <i className="key-funding" aria-hidden="true" />
            <span>State funding</span>
          </span>
        )}
        <button
          type="button"
          className="atlas-legend-toggle"
          aria-expanded={expanded}
          aria-controls="atlas-legend-popover"
          onClick={() => setExpanded(!expanded)}
          title="Explain map layers, numbers and dots"
        >
          <Info size={13} aria-hidden="true" />
          <span>Explain map</span>
          {expanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronUp size={12} aria-hidden="true" />}
        </button>
      </div>

      {expanded && (
        <div
          id="atlas-legend-popover"
          className="atlas-legend-popover"
          role="dialog"
          aria-label="How to read the map"
        >
          <div className="atlas-legend-header">
            <h4>How to read the map</h4>
            <button
              type="button"
              className="icon-button"
              aria-label="Close map explanation"
              onClick={() => setExpanded(false)}
            >
              <X size={15} />
            </button>
          </div>

          <div className="atlas-legend-grid">
            <div className="legend-explainer-row">
              <div className="legend-symbol-cell">
                <span className="sample-cluster">12k</span>
              </div>
              <div className="legend-text-cell">
                <strong>Numbered circles (zoom &lt; 6)</strong>
                <p>
                  Groups of nearby historical locations in that area. <em>Click or tap any circle to zoom in</em> and see individual locations.
                </p>
              </div>
            </div>

            <div className="legend-explainer-row">
              <div className="legend-symbol-cell">
                <i className="key-history" aria-hidden="true" />
              </div>
              <div className="legend-text-cell">
                <strong>Individual dots (zoom 6+)</strong>
                <p>
                  Archived 2022 facility coordinates (schools, health centres, roads). They represent <em>geography</em>, <strong>not proof of current spending</strong>. Financial records remain unlinked until official receipts are verified.
                </p>
              </div>
            </div>

            <div className="legend-explainer-row">
              <div className="legend-symbol-cell">
                <i className="key-project" aria-hidden="true" />
              </div>
              <div className="legend-text-cell">
                <strong>Blue dots · Reviewed projects</strong>
                <p>
                  Public works supported by official documentary evidence (sanctions, contractor bill payments, or completion certificates).
                </p>
              </div>
            </div>

            <div className="legend-explainer-row">
              <div className="legend-symbol-cell">
                <i className="key-funding" aria-hidden="true" />
              </div>
              <div className="legend-text-cell">
                <strong>State colors · Funding received</strong>
                <p>
                  State-wide Union funding allocated or released for the selected financial year ({displayYear}).
                </p>
              </div>
            </div>
          </div>

          <div className="legend-filter-scope">
            <strong>Active filter scope:</strong>
            <p>
              Financial Year ({displayYear}) and purpose ({purpose}) apply to <em>funding and reviewed projects</em>. Historical locations are an archived spatial baseline and do not reflect annual budget cycles.
            </p>
          </div>

          {onOpenLayers && (
            <button
              type="button"
              className="atlas-text-button legend-layers-btn"
              onClick={() => {
                setExpanded(false);
                onOpenLayers();
              }}
            >
              <Layers size={14} /> Configure visible layers ({activeCount} active)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
