import { readFileSync } from 'node:fs';
import { logoFaviconSvg } from '@teamtrail/scout-avatar';
import { expect, test } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// The favicon is the bare mark, inline so it never costs a request; it must be the package's current drawing.
test('the favicon is the logo package’s favicon SVG', () => {
  const href = html.match(/<link\s+rel="icon"\s+href="([^"]+)"/)?.[1];
  expect(href).toBe(`data:image/svg+xml,${encodeURIComponent(logoFaviconSvg())}`);
});

test('the favicon switches to the dark version on dark browser tabs', () => {
  expect(logoFaviconSvg()).toContain('@media (prefers-color-scheme:dark)');
});
