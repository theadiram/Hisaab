import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MapLegend } from '../src/components/map-legend';

describe('MapLegend component (Issue #21)', () => {
  it('renders persistent legend cues for all enabled layers', () => {
    const html = renderToStaticMarkup(
      createElement(MapLegend, {
        layers: { funding: true, projects: true, historical: true },
        year: '2024-2025',
        purpose: 'All',
      })
    );

    expect(html).toContain('Reviewed projects');
    expect(html).toContain('Archived locations');
    expect(html).toContain('not yearly spending');
    expect(html).toContain('State funding');
    expect(html).toContain('Explain map');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Map layer legend and explanation"');
  });

  it('omits disabled layers from the compact legend pill', () => {
    const html = renderToStaticMarkup(
      createElement(MapLegend, {
        layers: { funding: false, projects: true, historical: false },
        year: '2024-2025',
        purpose: 'Roads',
      })
    );

    expect(html).toContain('Reviewed projects');
    expect(html).not.toContain('Archived locations');
    expect(html).not.toContain('State funding');
  });

  it('formats the financial year correctly in the legend', () => {
    const html = renderToStaticMarkup(
      createElement(MapLegend, {
        layers: { funding: true, projects: true, historical: true },
        year: '2025-2026',
        purpose: 'Schools & education',
      })
    );

    expect(html).toContain('atlas-legend');
    expect(html).toContain('atlas-legend-toggle');
  });
});
