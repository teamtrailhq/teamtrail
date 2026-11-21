import { expect, test } from 'vitest';
import { LOGO_COLORS } from '../src/logo/logoColors';
import { logoFaviconSvg } from '../src/logo/logoFaviconSvg';
import { LOGO_IN_CIRCLE } from '../src/logo/logoInCircle';
import { logoMarkup } from '../src/logo/logoMark';
import { LOGO_ON_TILE } from '../src/logo/logoOnTile';

/** The mark as it was chosen, exactly. */
const CHOSEN =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g fill="#FF6B2C"><rect x="88" y="10" width="24" height="56" transform="rotate(60 100 100)"/><rect x="88" y="10" width="24" height="56" transform="rotate(120 100 100)"/><rect x="88" y="10" width="24" height="56" transform="rotate(180 100 100)"/><rect x="88" y="10" width="24" height="56" transform="rotate(240 100 100)"/><rect x="88" y="10" width="24" height="56" transform="rotate(300 100 100)"/></g><rect x="88" y="10" width="24" height="56" fill="#8E8E96"/></svg>';

/** An arm's outer corner, the mark's farthest point from the centre. */
const REACH = Math.hypot(12, 90);

function placed(transform: string) {
  const [, tx, ty, k] = transform.match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)/)!.map(Number);
  return { centre: [tx + 100 * k, ty + 100 * k], reach: REACH * k };
}

test('the favicon is the chosen mark, on transparency, the same on light and dark tabs', () => {
  expect(logoFaviconSvg()).toBe(CHOSEN);
  expect(logoFaviconSvg()).not.toContain('width="200"');
  expect(logoFaviconSvg()).not.toContain('prefers-color-scheme');
});

test('six block cursors around an open centre: the one pointing up grey, the other five blaze', () => {
  const svg = logoMarkup();
  expect(svg.match(/<rect /g)).toHaveLength(6);
  expect(svg).toContain(`<rect x="88" y="10" width="24" height="56" fill="${LOGO_COLORS.lead}"/>`);
  for (const deg of [60, 120, 180, 240, 300]) expect(svg).toContain(`transform="rotate(${deg} 100 100)"`);
  expect(LOGO_COLORS).toMatchObject({ arm: '#FF6B2C', lead: '#8E8E96' });
});

test('in a circle, the mark is centred and its farthest corner well inside the radius', () => {
  const svg = logoMarkup({ round: true });
  expect(svg).toContain(`<g transform="${LOGO_IN_CIRCLE}">`);
  expect(svg).not.toContain('width="200"');
  const m = placed(LOGO_IN_CIRCLE);
  expect(m.centre).toEqual([100, 100]);
  expect(m.reach).toBeLessThan(80);
  expect(m.reach).toBeGreaterThan(65);
});

test('on its opaque tile, the mark sits centred on near-black, never blaze', () => {
  const svg = logoMarkup({ tile: true });
  expect(svg.startsWith(`<rect width="200" height="200" fill="${LOGO_COLORS.tile}"/>`)).toBe(true);
  expect(LOGO_COLORS.tile).toBe('#0A0A0B');
  expect(placed(LOGO_ON_TILE).centre).toEqual([100, 100]);
});
