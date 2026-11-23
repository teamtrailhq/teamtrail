/**
 * Guide icons in a 200×200 box, drawn like the site's scenes (the laptop, the phone): thin square ink lines, light
 * panels, grey text bars and one blaze square that carries the meaning. Alone on a transparent background, so they sit
 * on the page itself. Community, the plus, has no accent.
 */
export type GuideRole = 'reviewer' | 'qa' | 'security' | 'docs' | 'architect' | 'community';

/** `dark` and `light` draw fixed colours; `auto` reads the `--tt-guide-*` variables the page sets, falling back to dark. */
export type GuideTheme = 'dark' | 'light' | 'auto';

interface Paint {
  ink: string;
  /** A panel's ground: a card, a page, the lens. */
  fill: string;
  /** Text bars, as the scenes' rows draw them. */
  mute: string;
  accent: string;
}

export const GUIDE_TONES: Record<'dark' | 'light', Paint> = {
  dark: { ink: '#EDEDEF', fill: '#161618', mute: '#3A3B40', accent: '#FF6B2C' },
  light: { ink: '#0E0F11', fill: '#F4F4F5', mute: '#D5D6DA', accent: '#D43F00' },
};

function paint(theme: GuideTheme): Paint {
  if (theme !== 'auto') return GUIDE_TONES[theme];
  const d = GUIDE_TONES.dark;
  const v = (key: keyof Paint) => `var(--tt-guide-${key}, ${d[key]})`;
  return { ink: v('ink'), fill: v('fill'), mute: v('mute'), accent: v('accent') };
}

/** The line every symbol is drawn with: thin, square-ended, mitred, like the scenes'. */
const LINE = 'stroke-width="5.5" stroke-linejoin="miter" stroke-linecap="square"';
const panel = (c: Paint, d: string) => `<path d="${d}" fill="${c.fill}" stroke="${c.ink}" ${LINE}/>`;
const bar = (c: Paint, x: number, y: number, w: number) => `<path d="M${x} ${y}h${w}v9h-${w}z" fill="${c.mute}"/>`;
const box = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h-${w}z`;

const SYMBOLS: Record<GuideRole, (c: Paint) => string> = {
  // A page of work under the lens; the line it found, in blaze, seen through it.
  reviewer: (c) =>
    panel(c, box(30, 24, 104, 136)) +
    bar(c, 48, 46, 60) +
    bar(c, 48, 64, 74) +
    bar(c, 48, 82, 44) +
    `<path d="M48 108h80v10h-80z" fill="${c.accent}"/>` +
    bar(c, 48, 132, 40) +
    `<circle cx="118" cy="118" r="34" fill="none" stroke="${c.ink}" ${LINE}/>` +
    `<path d="M144 144L170 170" stroke="${c.ink}" stroke-width="14" stroke-linecap="square"/>`,
  // A checklist: two items ticked, the one being checked now in blaze.
  qa: (c) =>
    panel(c, box(32, 24, 136, 152)) +
    [48, 88, 128]
      .map((y, i) => {
        const square =
          i === 2
            ? `<path d="${box(50, y, 26, 26)}" fill="${c.accent}"/>`
            : `<path d="${box(50, y, 26, 26)}" fill="none" stroke="${c.ink}" ${LINE}/>`;
        const tick = i < 2 ? `<path d="M56 ${y + 13}l6 6l9 -12" fill="none" stroke="${c.ink}" ${LINE}/>` : '';
        return square + tick + bar(c, 90, y + 8, i === 1 ? 46 : 60);
      })
      .join(''),
  // A shield with a lock; the lock's body in blaze.
  security: (c) =>
    panel(c, 'M100 22L164 42V98Q164 150 100 178Q36 150 36 98V42Z') +
    `<path d="M86 104V90Q86 74 100 74Q114 74 114 90V104" fill="none" stroke="${c.ink}" ${LINE}/>` +
    `<path d="${box(76, 104, 48, 38)}" fill="${c.accent}" stroke="${c.ink}" ${LINE}/>`,
  // Two pages, the front one with its lines and a blaze bookmark.
  docs: (c) =>
    panel(c, box(62, 22, 106, 132)) +
    panel(c, box(32, 46, 106, 132)) +
    `<path d="M108 46V90L119 81L130 90V46Z" fill="${c.accent}"/>` +
    bar(c, 50, 74, 44) +
    bar(c, 50, 102, 70) +
    bar(c, 50, 120, 70) +
    bar(c, 50, 138, 50),
  // A system drawn as a map: two parts joined into the one the change fits, in blaze.
  architect: (c) =>
    `<path d="M52 70V112H100V128M148 70V112H100" fill="none" stroke="${c.ink}" ${LINE}/>` +
    panel(c, box(28, 26, 48, 44)) +
    panel(c, box(124, 26, 48, 44)) +
    bar(c, 40, 44, 24) +
    bar(c, 136, 44, 24) +
    `<path d="${box(70, 128, 60, 48)}" fill="${c.accent}" stroke="${c.ink}" ${LINE}/>`,
  // A plus in outline: anyone's guide, no accent.
  community: (c) => panel(c, 'M80 28H120V80H172V120H120V172H80V120H28V80H80Z'),
};

/** One guide's icon, the symbol alone; `theme` picks its colours (`auto` by default: the page's `--tt-guide-*`). */
export function guideMarkup(role: GuideRole, theme: GuideTheme = 'auto') {
  return `<g>${SYMBOLS[role](paint(theme))}</g>`;
}
