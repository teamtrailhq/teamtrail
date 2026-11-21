import { metaTextWidth } from './metaTextWidth';

/**
 * A label part's tone on a map card: rose (`urgent`) only for what needs you now, blaze (`agent`) an agent at work,
 * green (`ok`) verified, amber (`warn`) held up, `wait` a ticket ready for an agent, `dim` what it waits on.
 */
export type CardLabelTone = 'plain' | 'urgent' | 'agent' | 'ok' | 'warn' | 'wait' | 'dim';

export interface CardLabelPart {
  text: string;
  tone: CardLabelTone;
  /** A guide added to the ticket: its id, its full name and version on hover, and whether agents can't use it now. */
  guide?: { id: string; tip: string; off?: boolean };
}

/** The separator between two parts, as drawn. */
export const LABEL_SEP = ' · ';
/** The label line's letter spacing (0.05em) makes its mono run a little wider than measured. */
const CAPS = 1.05;

/** How wide a label line draws, in map units. */
export function labelWidth(parts: CardLabelPart[]) {
  const text = parts.map((p) => p.text.toUpperCase()).join(LABEL_SEP);
  return metaTextWidth(text, 'mono') * CAPS;
}

/**
 * Fits a card's label line to `room`: the first candidate that fits whole, richest first; else the last one with its
 * last part cut short with "…", so the line never runs past the card's edge.
 */
export function fitLabel(candidates: CardLabelPart[][], room: number): CardLabelPart[] {
  for (const c of candidates) if (labelWidth(c) <= room) return c;
  const last = candidates[candidates.length - 1] ?? [];
  if (!last.length) return last;
  const head = last.slice(0, -1);
  const tail = last[last.length - 1];
  for (let n = tail.text.length - 1; n > 0; n--) {
    const cut = [...head, { ...tail, text: `${tail.text.slice(0, n).trimEnd()}…` }];
    if (labelWidth(cut) <= room) return cut;
  }
  return head;
}
