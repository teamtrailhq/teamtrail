/**
 * Guide icons in a 200×200 box: one flat symbol for each speciality on a square tile with a hairline edge. No colour
 * per guide: every symbol is drawn in ink with one blaze accent, and Community, the plus, has no accent at all.
 */
export type GuideRole = 'reviewer' | 'qa' | 'security' | 'docs' | 'architect' | 'community';

/** `dark` and `light` draw fixed colours; `auto` reads the `--tt-guide-*` variables the page sets, falling back to dark. */
export type GuideTheme = 'dark' | 'light' | 'auto';

interface Paint {
  ink: string;
  fill: string;
  accent: string;
  bg: string;
  line: string;
}

export const GUIDE_TONES: Record<'dark' | 'light', Paint> = {
  dark: { ink: '#EDEDEF', fill: '#1C1C1F', accent: '#FF6B2C', bg: '#141416', line: 'rgba(255,255,255,.14)' },
  light: { ink: '#0E0F11', fill: '#FFFFFF', accent: '#D43F00', bg: '#F4F4F6', line: 'rgba(0,0,0,.12)' },
};

function paint(theme: GuideTheme): Paint {
  if (theme !== 'auto') return GUIDE_TONES[theme];
  const d = GUIDE_TONES.dark;
  const v = (key: keyof Paint) => `var(--tt-guide-${key}, ${d[key]})`;
  return { ink: v('ink'), fill: v('fill'), accent: v('accent'), bg: v('bg'), line: v('line') };
}

const SHIELD = 'M100 38l54 18v44q-2 40-54 62q-52-22-54-62V56z';

const SYMBOLS: Record<GuideRole, (c: Paint) => string> = {
  reviewer: (c) =>
    `<circle cx="88" cy="88" r="36" fill="${c.fill}" stroke="${c.ink}" stroke-width="13"/>` +
    `<path d="M114 114L150 150" stroke="${c.ink}" stroke-width="20" stroke-linecap="round"/>` +
    `<path d="M72 80q6-14 22-14" fill="none" stroke="${c.accent}" stroke-width="7" stroke-linecap="round"/>`,
  qa: (c) =>
    `<circle cx="100" cy="100" r="56" fill="${c.fill}" stroke="${c.ink}" stroke-width="13"/>` +
    `<path d="M74 102l18 20 36-42" fill="none" stroke="${c.accent}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`,
  security: (c) =>
    `<path d="${SHIELD}" fill="${c.fill}"/><path d="M100 52v96q40-18 42-50V64z" fill="${c.accent}"/>` +
    `<path d="${SHIELD}" fill="none" stroke="${c.ink}" stroke-width="13" stroke-linejoin="round"/>`,
  docs: (c) =>
    `<path d="M100 66C84 52 62 50 40 54V144C62 140 84 142 100 156C116 142 138 140 160 144V54C138 50 116 52 100 66Z" fill="${c.fill}" stroke="${c.ink}" stroke-width="13" stroke-linejoin="round"/>` +
    `<path d="M100 66V156" stroke="${c.ink}" stroke-width="11"/>` +
    `<path d="M58 80q14-2 26 4M58 104q14-2 26 4M116 84q12-6 26-4M116 108q12-6 26-4" fill="none" stroke="${c.accent}" stroke-width="7" stroke-linecap="round"/>`,
  architect: (c) =>
    `<path d="M100 60L64 152M100 60L136 152" fill="none" stroke="${c.ink}" stroke-width="22" stroke-linecap="round"/>` +
    `<path d="M100 60L64 152M100 60L136 152" fill="none" stroke="${c.fill}" stroke-width="8" stroke-linecap="round"/>` +
    `<path d="M74 122Q100 136 126 122" fill="none" stroke="${c.ink}" stroke-width="12" stroke-linecap="round"/>` +
    `<circle cx="100" cy="54" r="17" fill="${c.accent}" stroke="${c.ink}" stroke-width="11"/>`,
  community: (c) =>
    `<path d="M100 54V146M54 100H146" stroke="${c.ink}" stroke-width="32" stroke-linecap="round"/>` +
    `<path d="M100 54V146M54 100H146" stroke="${c.fill}" stroke-width="11" stroke-linecap="round"/>`,
};

/** One guide's icon; `theme` picks the version for the background (`auto` by default: the page's `--tt-guide-*`). */
export function guideMarkup(role: GuideRole, theme: GuideTheme = 'auto') {
  const p = paint(theme);
  const symbol = SYMBOLS[role]({ ...p, accent: role === 'community' ? p.ink : p.accent });
  return [
    `<rect x="1" y="1" width="198" height="198" fill="${p.bg}" stroke="${p.line}" stroke-width="2"/>`,
    `<g transform="translate(20 20) scale(.8)">${symbol}</g>`,
  ].join('');
}
