/**
 * Scout's face on his screen, in the portrait's 200×200 box. He is turned to the right, so the far eye is narrower.
 */
import type { BadgeColors } from './badgeArt';
import type { Eye, Mouth } from './types';

const NEAR = { x: 112, w: 15 };
const FAR = { x: 136, w: 10 };

/** One open eye: lit, brighter on its lower half, with a catchlight. */
function openEye({ x, w }: { x: number; w: number }, dx: number, dy: number, c: BadgeColors) {
  const left = x + dx;
  return [
    `<rect x="${left}" y="${94 + dy}" width="${w}" height="12" rx="${w > 12 ? 5 : 4}" fill="${c.glowLight}"/>`,
    `<rect x="${left}" y="${100 + dy}" width="${w}" height="6" rx="3" fill="${c.glow}"/>`,
    `<rect x="${left + w - 6}" y="${96 + dy}" width="${w > 12 ? 3.5 : 2.5}" height="3.5" rx="1" fill="#fff"/>`,
  ].join('');
}

function wideEye({ x, w }: { x: number; w: number }, c: BadgeColors) {
  const outer = w + 3;
  const pupil = w > 12 ? 6 : 5;
  return (
    `<rect x="${x - 2}" y="90" width="${outer}" height="18" rx="${outer / 2.6}" fill="${c.glowLight}"/>` +
    `<rect x="${x - 2 + (outer - pupil) / 2}" y="96" width="${pupil}" height="6" rx="2" fill="${c.glass}"/>`
  );
}

function eyesMarkup(eyes: Eye, c: BadgeColors) {
  if (eyes === 'closed')
    return [NEAR, FAR]
      .map(({ x, w }) => `<rect x="${x}" y="100" width="${w}" height="4" rx="2" fill="${c.glow}"/>`)
      .join('');
  if (eyes === 'wide') return wideEye(NEAR, c) + wideEye(FAR, c);
  const [dx, dy] = eyes === 'aside' ? [4, -5] : [0, 0];
  return openEye(NEAR, dx, dy, c) + openEye(FAR, dx, dy, c);
}

function mouthMarkup(mouth: Mouth, c: BadgeColors) {
  if (mouth === 'open')
    return (
      `<rect x="124" y="114" width="16" height="9" rx="4.5" fill="${c.glowLight}"/>` +
      `<rect x="127" y="119" width="10" height="4" rx="2" fill="${c.glow}"/>`
    );
  if (mouth === 'mid') return `<rect x="126" y="115" width="12" height="5" rx="2.5" fill="${c.glowLight}"/>`;
  if (mouth === 'aside')
    return [0, 1, 2].map((i) => `<circle cx="${124 + i * 7}" cy="118" r="2.6" fill="${c.glow}"/>`).join('');
  return `<path d="M125 116q6 5 12 0" fill="none" stroke="${c.glow}" stroke-width="4" stroke-linecap="round"/>`;
}

/** Eyes and mouth. `aside` eyes look up and away and the `aside` mouth is three dots: Scout thinking. */
export function faceMarkup({ eyes, mouth }: { eyes: Eye; mouth: Mouth }, c: BadgeColors) {
  return eyesMarkup(eyes, c) + mouthMarkup(mouth, c);
}
