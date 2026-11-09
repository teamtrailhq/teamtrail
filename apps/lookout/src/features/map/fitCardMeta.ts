import { NODE_W } from '@teamtrail/core';
import { clipName } from '../guides';
import { CARD_TEXT_X } from './cardLayout';

/** About how many meta-line characters fit on a card: 9.5px sentence-case text runs near 5.2px a character. */
const CARD_META_CHARS = 31;
/** The card's width less the meta line's inset and a little air. */
const CARD_META_WIDTH = NODE_W - CARD_TEXT_X - 10;
/** The guide's name keeps at least this much room, so it stays recognisable. */
const GUIDE_MIN = 9;

/**
 * Fits a card's meta line (key · type · guide · state) on the card: the guide's name is clipped to the characters
 * the other parts leave, and a line still too long is squeezed to the card's width rather than run past its edge.
 */
export function fitCardMeta(input: { parts: (string | false | undefined)[]; guide?: string }) {
  const used = input.parts.filter(Boolean).join(' · ').length;
  const guideText =
    input.guide === undefined ? undefined : clipName(input.guide, Math.max(GUIDE_MIN, CARD_META_CHARS - used - 3));
  const chars = guideText === undefined ? used : used + 3 + guideText.length;
  const squeeze = chars > CARD_META_CHARS ? { textLength: CARD_META_WIDTH, lengthAdjust: 'spacingAndGlyphs' } : {};
  return { guideText, squeeze };
}
