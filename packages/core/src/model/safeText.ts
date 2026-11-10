import { BRAND } from './brand';

/*
 * Free text never becomes structure. Tracker files and issue bodies are markdown that Teamtrail parses back:
 * frontmatter keys, headings that carry who wrote a comment or which ticket a section belongs to, list items,
 * and `<!-- teamtrail:… -->` markers that carry state. Text that agents (or anyone) supply goes through one of
 * these on the way in, and its reader's counterpart on the way out, so nothing written as text can be read back
 * as a field, an author, a confirmation or a marker. Files written before this existed still read the same.
 */

/** Characters that end a line somewhere (for JavaScript's `^`, for YAML, for a terminal), and other controls. */
// eslint-disable-next-line no-control-regex -- control characters are exactly what this looks for
const CONTROL = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/;
// eslint-disable-next-line no-control-regex -- control characters are exactly what this looks for
const CONTROLS = /[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g;
const LINE_BREAK = /\r\n|[\r\u0085\u2028\u2029]/g;
/** Control characters that are no line break and no tab: never meaningful in text. */
// eslint-disable-next-line no-control-regex -- control characters are exactly what this looks for
const STRAY = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Whether a single-line value holds a line break or another control character. */
export const hasControl = (s: string) => CONTROL.test(s);

/** A value that must stay on one line (a title, a list item, a name in a heading): breaks become spaces. */
export const oneLine = (s: string) => s.replace(CONTROLS, ' ').trim();

/** Multi-line text with every kind of line break as `\n`, so "start of line" means one thing everywhere. */
export const plainBreaks = (s: string) => s.replace(LINE_BREAK, '\n').replace(STRAY, '');

/**
 * Makes sure no line of `text` can be read as one of a format's structural lines. `structure` is that format's
 * line pattern without the `^` (e.g. `##\s`). A matching line gets a leading backslash, which markdown shows as
 * the same text; lines that already look escaped get one more, so `unguardLines` restores the text exactly.
 */
export function guardLines(text: string, structure: string) {
  const hit = new RegExp(`^\\\\*(?:${structure})`);
  return plainBreaks(text)
    .split('\n')
    .map((line) => (hit.test(line) ? `\\${line}` : line))
    .join('\n');
}

export function unguardLines(text: string, structure: string) {
  const hit = new RegExp(`^\\\\+(?:${structure})`);
  return text
    .split('\n')
    .map((line) => (hit.test(line) ? line.slice(1) : line))
    .join('\n');
}

const P = BRAND.labelPrefix;
const MARKER = new RegExp(`<(\\\\*)!--(?=\\s*${P}:)`, 'g');
const GUARDED_MARKER = new RegExp(`<\\\\(\\\\*)!--(?=\\s*${P}:)`, 'g');

/**
 * Text can't open a `<!-- teamtrail:… -->` marker (ticket state, a comment's author, a decision record, an
 * assumption's id): the opener is written `<\!--`, which no marker pattern matches and trackers show as text.
 */
export const guardMarkers = (text: string) => text.replace(MARKER, '<\\$1!--');
export const unguardMarkers = (text: string) => text.replace(GUARDED_MARKER, '<$1!--');
