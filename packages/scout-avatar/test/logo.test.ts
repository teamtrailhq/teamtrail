import { expect, test } from 'vitest';
import { LOGO_COLORS } from '../src/logo/logoColors';
import { logoFaviconSvg } from '../src/logo/logoFaviconSvg';
import { logoBareMarkup, logoMarkup } from '../src/logo/logoMark';
import { LOGO_ON_TILE } from '../src/logo/logoOnTile';

/** The box the logo's shapes fill in their own 200 box: x 14–196, y 0–196. */
const SHAPES = { left: 14, top: 0, right: 196, bottom: 196 };

function placed(transform: string) {
  const [, tx, ty, k] = transform.match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)/)!.map(Number);
  return {
    left: tx + SHAPES.left * k,
    right: 200 - (tx + SHAPES.right * k),
    top: ty + SHAPES.top * k,
    bottom: 200 - (ty + SHAPES.bottom * k),
  };
}

test('the t runs to a block cursor, not a dot', () => {
  const svg = logoMarkup('dark');
  expect(svg).toContain('<rect x="154" y="110" width="42" height="86" fill="#FF6B2C"/>');
  expect(svg).toContain('<path d="M14 58H140V102H14Z"');
  expect(svg).not.toContain('<circle');
});

test('the mark sits centred on its tile, with an even margin', () => {
  const m = placed(LOGO_ON_TILE);
  expect(m.left).toBeCloseTo(m.right, 1);
  expect(m.top).toBeCloseTo(m.bottom, 1);
  expect(m.top).toBeCloseTo(SHAPES.bottom * 0.16 * (200 / (SHAPES.bottom * 1.32)), 1);
});

test('the bare mark stays inside its box, centred', () => {
  const transform = logoBareMarkup().match(/transform="([^"]+)"/)![1];
  const m = placed(transform);
  expect(Math.min(m.left, m.right, m.top, m.bottom)).toBeGreaterThan(0);
  expect(m.left).toBeCloseTo(m.right, 0);
  expect(m.top).toBeCloseTo(m.bottom, 0);
});

test('the cursor is white on the blaze tile, the favicon, and blaze on the others', () => {
  expect(LOGO_COLORS.blaze.cursor).toBe('#FFFFFF');
  expect(LOGO_COLORS.dark.cursor).toBe('#FF6B2C');
  expect(LOGO_COLORS.light.cursor).toBe('#FF6B2C');
  expect(logoFaviconSvg()).toContain('width="42" height="86" fill="#FFFFFF"');
  expect(logoMarkup('auto')).toContain('var(--tt-logo-cursor, #FF6B2C)');
});
