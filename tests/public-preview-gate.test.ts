import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PublicPreviewGate } from '../src/components/public-preview-gate';

describe('public preview entry notice', () => {
  it('renders the notice without mounting the map before hydration or acknowledgement', () => {
    const html = renderToStaticMarkup(
      createElement(PublicPreviewGate, { children: createElement('main', null, 'Map controls') }),
    );
    expect(html).toContain('<div tabindex="-1" inert=""></div>');
    expect(html).not.toContain('Map controls');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Hisaab is still under development.');
    expect(html).toContain('8,12,976');
    expect(html).toContain('3,30,080');
    expect(html).toContain('asset records');
    expect(html).toContain('project and activity source records');
    expect(html).toContain('I understand — explore Hisaab');
  });
});
