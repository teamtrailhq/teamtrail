/** Control characters (other than tab and new line), direction overrides and zero-width characters. */
// eslint-disable-next-line no-control-regex -- control characters are exactly what this looks for
const UNSEEN = /[\x00-\x08\x0B-\x1F\x7F-\x9F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/**
 * Text from a guide made safe to print: anything a terminal would act on or not show (an escape sequence, a carriage
 * return, a backspace, a direction override) is written out as `\u{…}`, so what is shown is what is there. The lint
 * already refuses such files; this holds even for one it didn't.
 */
export function printable(text: string): string {
  return text.replace(UNSEEN, (c) => `\\u{${c.codePointAt(0)!.toString(16)}}`);
}
