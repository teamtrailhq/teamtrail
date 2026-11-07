/**
 * Scout: the original CRT head drawn smooth on its 32-unit grid, so every part keeps its size: wide shell and chin, big
 * screen, flat eyes, ear cups and the status light on top, with a cap. One function returns the SVG markup, so
 * <ScoutAvatar> and mountScout draw exactly the same thing.
 */
import type { Eye, Light, Mouth } from './types';

export interface BadgeColors {
  ink: string;
  shellLight: string;
  shell: string;
  shellShade: string;
  frame: string;
  glass: string;
  scan: string;
  glow: string;
  glowLight: string;
  cup: string;
  cupLight: string;
  cupDark: string;
  band: string;
  hat: string;
  visor: string;
  panel: string;
  button: string;
}

export const SCOUT_COLORS: BadgeColors = {
  ink: '#16302a',
  shellLight: '#f6f1e2',
  shell: '#eae3cf',
  shellShade: '#c8bea2',
  frame: '#b4aa8f',
  glass: '#14241f',
  scan: '#18302a',
  glow: '#6fbf8f',
  glowLight: '#b4e8c0',
  cup: '#b9562a',
  cupLight: '#d67a45',
  cupDark: '#8a3d1d',
  band: '#8f9690',
  hat: '#8a5a38',
  visor: '#6b4630',
  panel: '#e6dcc0',
  button: '#c8581e',
};

export interface BadgeLamp {
  on: string;
  dim: string;
  alert: string;
}

export const LAMP_DAY: BadgeLamp = { on: '#e2711d', dim: '#a8501c', alert: '#ff5a48' };
/** At night the same Scout's lamp burns bright. */
export const LAMP_NIGHT: BadgeLamp = { on: '#ffd166', dim: '#a8501c', alert: '#ff5a48' };

export interface BadgeFace {
  eyes: Eye;
  mouth: Mouth;
  light?: Light;
}

/** A rounded bar: `[x, y, width, height]` on the grid. */
const bar = ([x, y, w, h]: [number, number, number, number], fill: string, r = 0.35) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;

/** One flat eye: three units wide, two tall, brighter on its lower half. */
function eye(x: number, kind: Eye, c: BadgeColors) {
  if (kind === 'closed') return bar([x, 17, 3, 1], c.glow);
  if (kind === 'wide') return bar([x, 15, 3, 3], c.glowLight) + bar([x + 1, 16, 1, 1], c.glass, 0.2);
  const left = kind === 'aside' ? x + 1 : x;
  return bar([left, 16, 3, 1.1], c.glow) + bar([left, 17, 3, 1], c.glowLight);
}

function mouthMarkup(mouth: Mouth, c: BadgeColors) {
  if (mouth === 'open') return bar([13, 20, 6, 1.1], c.glowLight) + bar([15, 21, 2, 1], c.glow);
  if (mouth === 'mid') return bar([14, 20, 4, 1], c.glowLight);
  if (mouth === 'aside') return bar([17, 20, 2, 1], c.glow);
  return bar([15, 20, 2, 1], c.glow);
}

const SCANLINES = [13, 15, 17, 19, 21, 23];

/** The small parts: scanlines and a reflection on the glass, buttons and ticks on the chin. */
function detailMarkup(c: BadgeColors) {
  return [
    SCANLINES.map((y) => bar([9.2, y, 13.6, 1], c.scan, 0)).join(''),
    bar([10, 13, 2, 1], c.frame, 0.2),
    bar([10, 14, 1, 1], c.frame, 0.2),
    bar([10, 25.2, 1, 1], c.button, 0.2),
    bar([11.2, 25.2, 1, 1], c.cupDark, 0.2),
    [17, 19, 21].map((x) => bar([x, 25.2, 1, 1.6], c.shellLight, 0.2) + bar([x, 25.2, 1, 0.8], c.frame, 0.2)).join(''),
  ].join('');
}

function cup(x: number, c: BadgeColors, line: string) {
  return [
    `<rect x="${x}" y="15" width="5.4" height="11" rx="1.7" fill="${c.cup}" ${line}/>`,
    bar([x + 1, 16, 1.2, 9], c.cupLight, 0.5),
    bar([x + 3.6, 16, 0.9, 9], c.cupDark, 0.4),
  ].join('');
}

/** Scout in a 200×200 box. `simple` drops the small parts for sizes under about 28px. */
export function badgeMarkup(
  face: BadgeFace,
  {
    lamp = LAMP_DAY,
    simple = false,
    colors = SCOUT_COLORS,
  }: { lamp?: BadgeLamp; simple?: boolean; colors?: BadgeColors } = {},
) {
  const c = colors;
  const eyes = simple ? 'open' : face.eyes;
  const mouth = simple ? 'rest' : face.mouth;
  const line = `stroke="${c.ink}" stroke-width=".9" stroke-linejoin="round"`;
  return [
    '<g transform="scale(6.25)">',
    `<path d="M3 16.5Q3 6 16 5.5Q29 6 29 16.5" fill="none" stroke="${c.ink}" stroke-width="3"/>`,
    `<path d="M3 16.5Q3 6 16 5.5Q29 6 29 16.5" fill="none" stroke="${c.band}" stroke-width="1.5"/>`,
    cup(0.6, c, line),
    cup(26, c, line),
    `<path d="M8 9H24Q26 9 26 11V25L23.5 28.5H8.5L6 25V11Q6 9 8 9Z" fill="${c.shell}" ${line}/>`,
    `<path d="M6.5 25H25.5L23.3 28H8.7Z" fill="${c.shellShade}"/>`,
    bar([6.6, 10, 1.6, 15], c.shellLight, 0.6),
    bar([8.4, 11, 15.2, 13.6], c.frame, 1.3),
    bar([9, 11.6, 14, 12.4], c.glass, 1),
    simple ? '' : detailMarkup(c),
    eye(11, eyes, c),
    eye(18, eyes, c),
    mouthMarkup(mouth, c),
    `<path d="M6.5 10.5Q5.8 3.5 16 3.100Q26.2 3.5 25.5 10.5Z" fill="${c.hat}" ${line}/>`,
    `<path d="M10.5 9.5Q10.3 4.9 16 4.5Q21.7 4.9 21.5 9.5Z" fill="${c.panel}" stroke="${c.ink}" stroke-width=".5"/>`,
    simple ? '' : `<path d="M16 5.400l1.2 1.7h-.6l1 1.5h-3.2l1-1.5h-.6z" fill="${c.hat}"/>`,
    `<path d="M6.3 9.8Q16 7.9 25.7 9.8Q27.2 12 25 12.600Q16 10.9 7 12.600Q4.8 12 6.3 9.8Z" fill="${c.visor}" ${line}/>`,
    `<circle cx="16" cy="2.600" r="1.3" fill="${lamp[face.light ?? 'on']}" stroke="${c.ink}" stroke-width=".7"/>`,
    '</g>',
  ].join('');
}
