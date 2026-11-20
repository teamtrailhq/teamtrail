import { readFileSync } from 'node:fs';
import { LOGO_COLORS, logoFaviconSvg } from '@teamtrail/scout-avatar';
import { expect, test } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// The favicon is the blaze tile, inline so it never costs a request; it must be the package's current drawing.
test('the favicon is the logo package’s favicon SVG', () => {
  const href = html.match(/<link\s+rel="icon"\s+href="([^"]+)"/)?.[1];
  expect(href).toBe(`data:image/svg+xml,${encodeURIComponent(logoFaviconSvg())}`);
});

test('the favicon is the blaze tile on every browser tab, light or dark', () => {
  const svg = logoFaviconSvg();
  expect(svg).toContain(`<rect width="200" height="200" fill="${LOGO_COLORS.blaze.tile}"/>`);
  expect(svg).not.toContain('prefers-color-scheme');
});
