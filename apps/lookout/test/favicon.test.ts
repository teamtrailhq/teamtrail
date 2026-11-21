import { readFileSync } from 'node:fs';
import { logoFaviconSvg } from '@teamtrail/scout-avatar';
import { expect, test } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function icon(type: string) {
  return html.match(new RegExp(`<link\\s+rel="icon"\\s+type="${type}"[^>]*\\shref="([^"]+)"`))?.[1];
}

// The favicon is the logo on transparency, inline so it never costs a request; it must be the package's current
// drawing, with the brand pack's 32px PNG for browsers that show no SVG icon.
test('the favicon is the logo package’s favicon SVG', () => {
  expect(icon('image/svg\\+xml')).toBe(`data:image/svg+xml,${encodeURIComponent(logoFaviconSvg())}`);
});

test('the PNG fallback is the brand pack’s favicon-32.png', () => {
  const png = readFileSync(new URL('../../../brand/favicon-32.png', import.meta.url)).toString('base64');
  expect(icon('image/png')).toBe(`data:image/png;base64,${png}`);
});

test('the favicon is the same on every browser tab, light or dark, on transparency', () => {
  const svg = logoFaviconSvg();
  expect(svg).not.toContain('prefers-color-scheme');
  expect(svg).not.toContain('width="200"');
});
