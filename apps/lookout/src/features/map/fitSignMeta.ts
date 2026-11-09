import { NODE_W } from '@teamtrail/core';
import { clipName } from '../guides';

/** About how many meta-line characters fit on a sign's board: 9.5px caps run near 6px each. */
const SIGN_META_CHARS = 31;
/** The board's width less the meta line's left inset and a little air. */
const SIGN_META_WIDTH = NODE_W - 18;

/**
 * Fits a sign's meta line (key · type · guide · state) on its board: the guide's name is clipped to the characters
 * the other parts leave, and a line still too long is squeezed to the board's width rather than run past the sign.
 */
export function fitSignMeta(input: { parts: (string | false | undefined)[]; guide?: string }) {
  const used = input.parts.filter(Boolean).join(' · ').length;
  const guideText = input.guide === undefined ? undefined : clipName(input.guide, SIGN_META_CHARS - used - 3);
  const chars = guideText === undefined ? used : used + 3 + guideText.length;
  const squeeze = chars > SIGN_META_CHARS ? { textLength: SIGN_META_WIDTH, lengthAdjust: 'spacingAndGlyphs' } : {};
  return { guideText, squeeze };
}
