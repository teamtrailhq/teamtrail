import { BRAND } from './brand';

/*
 * Free text never becomes structure. Tracker files and issue bodies are markdown that Teamtrail parses back:
 * frontmatter keys, headings that carry who wrote a comment or which ticket a section belongs to, list items,
 * and `<!-- teamtrail:… -->` markers that carry state. Text that agents (or anyone) supply goes through one of
 * these on the way in, and its reader's counterpart on the way out, so nothing written as text can be read back
 * as a field, an author, a confirmation or a marker. Files written before this existed still read the same.
 */

/**
 * What a single-line value may not hold: anything that ends a line somewhere (for JavaScript's `^`, for YAML, for
 * a terminal), the other C0 and C1 controls, and the invisible characters that change how text reads without
 * showing: the byte-order mark, zero-width space and word joiner, and the bidirectional overrides and isolates
 * (which can make "approved by X" display as something else). The zero-width joiner and non-joiner stay: emoji
 * sequences and several scripts need them. So do the left-to-right and right-to-left marks.
 */
// eslint-disable-next-line no-control-regex -- control characters are exactly what this looks for
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b\u2060\ufeff\u202a-\u202e\u2066-\u2069]/;
// eslint-disable-next-line no-control-regex -- control characters are exactly what this looks for
const CONTROLS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b\u2060\ufeff\u202a-\u202e\u2066-\u2069]+/g;
const LINE_BREAK = /\r\n|[\r\u0085\u2028\u2029]/g;
/** In multi-line text: the same characters, minus the line breaks and the tab. They are dropped. */
/* eslint-disable no-control-regex -- control characters are exactly what this looks for */
const STRAY =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u0084\u0086-\u009f\u200b\u2060\ufeff\u202a-\u202e\u2066-\u2069]/g;
/* eslint-enable no-control-regex */

/** Whether a single-line value holds a line break or another control character. */
export const hasControl = (s: string) => CONTROL.test(s);

/** A value that must stay on one line (a title, a list item, a name in a heading): breaks become spaces. */
export const oneLine = (s: string) => s.replace(CONTROLS, ' ').trim();

/** Multi-line text with every kind of line break as `\n`, so "start of line" means one thing everywhere. */
export const plainBreaks = (s: string) => s.replace(LINE_BREAK, '\n').replace(STRAY, '');

/**
 * Makes sure no line of `text` can be read as one of a format's structural lines. `structure` is that format's
 * line pattern without the `^` (e.g. `##\s`). A matching line gets a leading backslash, which markdown shows as
 * the same text; lines that already look escaped get one more, so `unguardLines` restores the (trimmed) text exactly.
 */
export function guardLines(text: string, structure: string) {
  const hit = new RegExp(`^\\\\*(?:${structure})`);
  // Trimmed first, the way every writer and reader trims a block: what is guarded is what ends up at column 0.
  return plainBreaks(text)
    .trim()
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
