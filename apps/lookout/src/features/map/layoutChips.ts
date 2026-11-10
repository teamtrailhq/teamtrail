import { NODE_W } from '@teamtrail/core';
import { clipName } from '../guides';
import { CARD_TEXT_X } from './cardLayout';
import { META_CHAR, metaTextWidth } from './metaTextWidth';

/** Space inside a chip, left and right of its text, and between two chips. */
const PAD = 4;
const GAP = 3;
/** The guide's name keeps at least this much room, so it stays recognisable. */
const GUIDE_MIN = 6;

export type ChipKind = 'key' | 'type' | 'guide' | 'state' | 'needs';
export interface CardChip {
  kind: ChipKind;
  text: string;
  /** Left edge, from the row's start. */
  x: number;
  /** The chip's width, and its text's (`textLength`, so the text always fits its chip). */
  w: number;
  textW: number;
}

/**
 * Lays out a card's meta row as label chips: key, type, guide, state (one chip per part: the agent, its step) and
 * "needs you". The guide's name is clipped to the room the others leave; a row still too long has its text squeezed
 * to the card's width, never run past its edge. `reserve` keeps room on the right for a reroute tag or the ❄.
 */
export function layoutChips(input: {
  key: string;
  type: string;
  guide?: string;
  state?: string;
  needsYou?: boolean;
  reserve?: number;
}): CardChip[] {
  const room = NODE_W - CARD_TEXT_X - 8 - (input.reserve ?? 0);
  const states = input.state?.split(' · ') ?? [];
  const parts: { kind: ChipKind; text: string }[] = [
    { kind: 'key', text: input.key },
    { kind: 'type', text: input.type },
    ...(input.guide === undefined ? [] : [{ kind: 'guide' as const, text: input.guide }]),
    ...states.map((text) => ({ kind: 'state' as const, text })),
    ...(input.needsYou ? [{ kind: 'needs' as const, text: 'needs you' }] : []),
  ];
  const textRoom = room - parts.length * 2 * PAD - (parts.length - 1) * GAP;
  const width = (p: { kind: ChipKind; text: string }) => metaTextWidth(p.text, p.kind === 'key' ? 'mono' : 'sans');
  const others = parts.filter((p) => p.kind !== 'guide').reduce((n, p) => n + width(p), 0);
  const guideChars = Math.max(GUIDE_MIN, Math.floor((textRoom - others) / META_CHAR));
  const fitted = parts.map((p) => (p.kind === 'guide' ? { ...p, text: clipName(p.text, guideChars) } : p));
  const scale = Math.min(1, textRoom / fitted.reduce((n, p) => n + width(p), 0));
  let x = 0;
  return fitted.map((p) => {
    const textW = width(p) * scale;
    const chip = { ...p, x, w: textW + 2 * PAD, textW };
    x += chip.w + GAP;
    return chip;
  });
}
