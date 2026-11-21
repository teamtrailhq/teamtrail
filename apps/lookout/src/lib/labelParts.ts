/**
 * The tones of a label line, and of each part of one. Red-rose (`urgent`) means "needs you now" and nothing else;
 * blaze (`agent`) is an agent and its work in progress; green (`ok`) is verified or done; `dim` steps a part back.
 * `plain` is the label line's own quiet colour.
 */
export type LabelTone = 'plain' | 'urgent' | 'agent' | 'ok' | 'dim';

/** One part of a label line: plain text, or text with its own tone, a tooltip and a class. */
export type LabelPart = string | { text: string; tone?: LabelTone; tip?: string; className?: string };

/** A label part as it's shown: text, its tone (the line's when it has none) and its tooltip. */
export interface ShownLabelPart {
  text: string;
  tone: LabelTone;
  tip?: string;
  /** A class of its own, for what finds the part by it (a row's kind). */
  className?: string;
}

/** The parts a label line shows, in order: empty and missing parts skipped, plain strings in the line's own tone. */
export function labelParts(parts: (LabelPart | false | null | undefined | '')[]): ShownLabelPart[] {
  const shown: ShownLabelPart[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (typeof part === 'string') {
      shown.push({ text: part, tone: 'plain' });
      continue;
    }
    if (!part.text) continue;
    shown.push({ text: part.text, tone: part.tone ?? 'plain', tip: part.tip, className: part.className });
  }
  return shown;
}
