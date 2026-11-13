/**
 * Scout: an AI scout companion in three-quarter view, looking to the right, drawn as a bust on a moss ground. A cap,
 * a headset with a mic, an antenna lamp and a neckerchief. One function returns the SVG markup, so <ScoutAvatar>,
 * mountScout and the brand exports draw exactly the same thing.
 */
import { bodyMarkup } from './portraitBody';
import { faceMarkup } from './portraitFace';
import { headMarkup } from './portraitHead';
import type { Eye, Light, Mouth } from './types';

export interface BadgeColors {
  ground: string;
  groundLight: string;
  shell: string;
  shellLight: string;
  shade: string;
  side: string;
  frame: string;
  glass: string;
  glow: string;
  glowLight: string;
  orange: string;
  orangeLight: string;
  orangeDark: string;
  hat: string;
  hatDark: string;
  brim: string;
  panel: string;
  band: string;
}

export const SCOUT_COLORS: BadgeColors = {
  ground: '#4f8a48',
  groundLight: '#5d9a55',
  shell: '#eee7d3',
  shellLight: '#faf6ea',
  shade: '#c9bfa2',
  side: '#b3a98c',
  frame: '#a99f83',
  glass: '#13231e',
  glow: '#6fd197',
  glowLight: '#c2f2cf',
  orange: '#e07a2f',
  orangeLight: '#f29a55',
  orangeDark: '#a8481c',
  hat: '#8a5a38',
  hatDark: '#6b4630',
  brim: '#5a3a26',
  panel: '#ece2c6',
  band: '#3a4a43',
};

export interface BadgeLamp {
  on: string;
  dim: string;
  alert: string;
}

export const LAMP_DAY: BadgeLamp = { on: '#ffb347', dim: '#a8501c', alert: '#ff5a48' };
/** At night the same Scout's lamp burns brighter. */
export const LAMP_NIGHT: BadgeLamp = { on: '#ffd166', dim: '#a8501c', alert: '#ff5a48' };

export interface BadgeFace {
  eyes: Eye;
  mouth: Mouth;
  light?: Light;
}

/** `circle` for avatars in the app, `rounded` for app-icon tiles, `square` to fill the box (Slack rounds it itself). */
export type BadgeShape = 'circle' | 'rounded' | 'square';

const CORNER: Record<BadgeShape, number> = { circle: 100, rounded: 46, square: 0 };
/** In a circle Scout is drawn a little smaller, so the ear cup and the lamp clear the curve. */
const CIRCLE_SCALE = 0.94;

let clipIds = 0;

/** Scout in a 200×200 box. `simple` drops the small parts for sizes under about 40px. */
export function badgeMarkup(
  face: BadgeFace,
  {
    lamp = LAMP_DAY,
    simple = false,
    shape = 'circle',
    colors = SCOUT_COLORS,
  }: { lamp?: BadgeLamp; simple?: boolean; shape?: BadgeShape; colors?: BadgeColors } = {},
) {
  const c = colors;
  const light = face.light ?? 'on';
  const k = shape === 'circle' ? CIRCLE_SCALE : 1;
  const offset = 100 * (1 - k);
  const id = `scout-clip-${++clipIds}`;
  const head = headMarkup({
    face: faceMarkup(face, c),
    lamp: lamp[light],
    lit: light !== 'dim',
    simple,
    c,
  });
  return [
    `<defs><clipPath id="${id}"><rect width="200" height="200" rx="${CORNER[shape]}"/></clipPath></defs>`,
    `<g clip-path="url(#${id})">`,
    `<rect width="200" height="200" fill="${c.ground}"/>`,
    `<circle cx="120" cy="88" r="74" fill="${c.groundLight}"/>`,
    `<g transform="translate(${offset} ${offset}) scale(${k})">${bodyMarkup(c)}${head}</g>`,
    '</g>',
  ].join('');
}
