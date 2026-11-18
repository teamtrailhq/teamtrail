/** What reading a file into a field gave: its text, or why it can't go in. */
export type ReadFile = { kind: 'text'; name: string; text: string } | { kind: 'refused'; reason: string };

/** The kinds of file a field takes: markdown and plain text, by their name. */
export const TEXT_FILE_ACCEPT = '.md,.markdown,.txt,text/markdown,text/plain';
const TEXT_FILE = /\.(md|markdown|txt)$/i;

const n = (x: number) => x.toLocaleString('en-US');

/**
 * Reads a local markdown or text file in the browser (nothing is uploaded: the text goes in the field, then
 * through the same create call and limits as typed text). Other kinds, binary files and anything past `max`
 * characters are refused with the reason.
 */
export async function readTextFile(file: File, max: number): Promise<ReadFile> {
  if (!TEXT_FILE.test(file.name))
    return {
      kind: 'refused',
      reason: `${file.name} isn't a markdown or text file: use a .md, .markdown or .txt file.`,
    };
  // A character is at most 4 bytes in UTF-8: a bigger file can't fit, so it isn't read at all.
  if (file.size > max * 4) return { kind: 'refused', reason: tooLong(file.name, max) };
  const text = (await file.text()).replace(/^\uFEFF/, '');
  if (text.includes('\u0000')) return { kind: 'refused', reason: `${file.name} isn't text.` };
  if (text.length > max) return { kind: 'refused', reason: tooLong(file.name, max, text.length) };
  return { kind: 'text', name: file.name, text };
}

function tooLong(name: string, max: number, length?: number) {
  const size = length === undefined ? '' : ` (${n(length)} characters)`;
  return `${name} is too long${size}: this field takes at most ${n(max)} characters.`;
}
