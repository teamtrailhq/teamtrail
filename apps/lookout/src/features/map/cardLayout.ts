import { NODE_W } from '@teamtrail/core';

/** Where a map card's label line and title start, from its left edge. */
export const CARD_TEXT_X = 10;
/** The label line's baseline, the title's first and second, and the step track's top. */
export const CARD_LABEL_Y = 16;
export const CARD_TITLE_Y = 31;
export const CARD_LINE_H = 14;
export const CARD_STEPS_Y = 50;
/** Room for the label line: the card less its sides and the cursor after it. */
export const CARD_LABEL_ROOM = NODE_W - CARD_TEXT_X * 2 - 8;
/** A done card: one line, centred where the full card would be. */
export const DONE_Y = 14;
export const DONE_H = 28;
