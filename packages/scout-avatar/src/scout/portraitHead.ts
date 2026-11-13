/**
 * Scout's head in three-quarter view, turned to the right: the near side in shade, a screen face, a headset with one
 * ear cup and a mic boom, a cap whose brim points where he looks, and an antenna lamp. 200×200 box.
 */
import type { BadgeColors } from './badgeArt';

/** The small parts, dropped under about 40px: the glass's reflection, the chin's buttons and the cap's pine tree. */
function details(c: BadgeColors) {
  return {
    shine: `<path d="M92 82h22l-14 20h-8z" fill="#fff" opacity=".08"/>`,
    chin: [
      `<circle cx="100" cy="142" r="3" fill="${c.orange}"/>`,
      `<circle cx="109" cy="142" r="3" fill="${c.orangeDark}"/>`,
      [132, 141, 150]
        .map((x) => `<rect x="${x}" y="139" width="5" height="7" rx="1.5" fill="${c.shellLight}"/>`)
        .join(''),
    ].join(''),
    pine: `<path d="M125 42l8 11h-4l7 10h-22l7-10h-4z" fill="${c.hat}"/>`,
  };
}

function lampMarkup(lamp: string, lit: boolean, simple: boolean, c: BadgeColors) {
  return [
    `<path d="M86 34L80 16" stroke="${c.band}" stroke-width="${simple ? 6 : 4}" stroke-linecap="round"/>`,
    lit ? `<circle cx="79" cy="14" r="11" fill="${lamp}" opacity=".3"/>` : '',
    `<circle cx="79" cy="14" r="${simple ? 8 : 6}" fill="${lamp}"/>`,
    lit ? `<circle cx="77" cy="12" r="2" fill="#fff3c4"/>` : '',
  ].join('');
}

/** The head, with `face` (eyes and mouth) on its screen and the antenna lamp in `lamp`. */
export function headMarkup({
  face,
  lamp,
  lit,
  simple,
  c,
}: {
  face: string;
  lamp: string;
  lit: boolean;
  simple: boolean;
  c: BadgeColors;
}) {
  const d = details(c);
  return [
    `<rect x="36" y="66" width="118" height="94" rx="22" fill="#000" opacity=".12"/>`,
    `<path d="M50 96Q46 52 96 46" fill="none" stroke="${c.band}" stroke-width="8" stroke-linecap="round"/>`,
    `<path d="M44 78Q44 62 60 60L74 58V152L60 150Q44 148 44 132Z" fill="${c.side}"/>`,
    `<rect x="68" y="56" width="98" height="96" rx="20" fill="${c.shell}"/>`,
    `<rect x="72" y="60" width="8" height="84" rx="4" fill="${c.shellLight}"/>`,
    `<path d="M68 132H166V140Q166 152 152 152H82Q68 152 68 140Z" fill="${c.shade}"/>`,
    `<rect x="82" y="72" width="76" height="62" rx="16" fill="${c.frame}"/>`,
    `<rect x="86" y="76" width="70" height="55" rx="13" fill="${c.glass}"/>`,
    simple ? '' : d.shine,
    face,
    simple ? '' : d.chin,
    `<ellipse cx="50" cy="108" rx="13" ry="21" fill="${c.orangeDark}"/>`,
    `<ellipse cx="56" cy="108" rx="12" ry="20" fill="${c.orange}"/>`,
    `<ellipse cx="53" cy="104" rx="4" ry="11" fill="${c.orangeLight}"/>`,
    `<path d="M60 122Q64 146 88 148" fill="none" stroke="${c.band}" stroke-width="5" stroke-linecap="round"/>`,
    `<circle cx="90" cy="148" r="6" fill="${c.band}"/><circle cx="91.5" cy="146.5" r="2" fill="${c.orange}"/>`,
    lampMarkup(lamp, lit, simple, c),
    `<path d="M48 76Q46 30 104 28Q158 30 162 70Z" fill="${c.hat}"/>`,
    `<path d="M48 76Q46 34 88 29Q66 42 66 74Z" fill="${c.hatDark}"/>`,
    `<path d="M96 70Q96 40 126 36Q152 40 154 68Z" fill="${c.panel}"/>`,
    simple ? '' : d.pine,
    `<path d="M150 82Q120 76 66 84L58 80Q56 72 64 70Q122 62 180 70Q190 76 182 84Z" fill="${c.brim}"/>`,
    `<path d="M70 84Q120 78 166 84L166 90Q120 84 70 90Z" fill="#000" opacity=".22"/>`,
  ].join('');
}
