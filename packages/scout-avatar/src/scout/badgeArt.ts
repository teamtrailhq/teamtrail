/**
 * Scout: an AI scout companion in three-quarter view, looking to the right, drawn as a bust on a square ground. A cap,
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

/** Scout himself, the same on every ground: a white shell, a graphite cap, blaze eyes, ear cup and neckerchief. */
const SCOUT_BODY: Omit<BadgeColors, 'ground' | 'groundLight'> = {
  shell: '#EDEDEF',
  shellLight: '#FFFFFF',
  shade: '#B9BBC1',
  side: '#9A9EA6',
  frame: '#6B7079',
  glass: '#0A0A0B',
  glow: '#FF6B2C',
  glowLight: '#FFB08A',
  orange: '#FF6B2C',
  orangeLight: '#FF8A55',
  orangeDark: '#C2410C',
  hat: '#2A2A2E',
  hatDark: '#1C1C1F',
  brim: '#111113',
  panel: '#DCDDE1',
  band: '#3A3D44',
};

/** The ground Scout stands on: `ink` (the default, on dark), `blaze` (app icons, Slack) or `paper` (on light). */
export type ScoutGround = 'ink' | 'blaze' | 'paper';

export const SCOUT_GROUNDS: Record<ScoutGround, BadgeColors> = {
  ink: { ...SCOUT_BODY, ground: '#141416', groundLight: '#1E1E21' },
  blaze: { ...SCOUT_BODY, ground: '#FF6B2C', groundLight: '#FF7F47' },
  /** On paper the cap goes a shade darker, so it holds against the pale ground. */
  paper: {
    ...SCOUT_BODY,
    ground: '#E9E9EC',
    groundLight: '#F4F4F6',
    hat: '#1C1C1F',
    hatDark: '#111113',
    brim: '#0A0A0B',
  },
};

export const SCOUT_COLORS: BadgeColors = SCOUT_GROUNDS.ink;

export interface BadgeLamp {
  on: string;
  dim: string;
  alert: string;
}

/** The antenna lamp: blaze when on, ember when dim, rose when Scout needs you. */
export const LAMP_DAY: BadgeLamp = { on: '#FF6B2C', dim: '#7A2E10', alert: '#FF4D7A' };
/** At night the same Scout's lamp burns a little brighter. */
export const LAMP_NIGHT: BadgeLamp = { on: '#FF8A55', dim: '#7A2E10', alert: '#FF4D7A' };

export interface BadgeFace {
  eyes: Eye;
  mouth: Mouth;
  light?: Light;
}

/** `circle` where avatars are round, `square` for tiles and app icons (Slack rounds them itself); `rounded` is kept for older callers. */
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
    ground = 'ink',
    colors,
  }: { lamp?: BadgeLamp; simple?: boolean; shape?: BadgeShape; ground?: ScoutGround; colors?: BadgeColors } = {},
) {
  const c = colors ?? SCOUT_GROUNDS[ground];
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
