import { parseMarkdown } from './parseMarkdown';
import { plainInline } from './plainInline';
import type { MdBlock } from './types';

/** The text of the first block that reads as words: a paragraph or heading, else inside a list or quote. */
function firstText(blocks: MdBlock[]): string | undefined {
  for (const b of blocks) {
    const text = blockText(b);
    if (text) return text;
  }
  return undefined;
}

function blockText(b: MdBlock): string | undefined {
  switch (b.kind) {
    case 'paragraph':
    case 'heading':
      return plainInline(b.text) || undefined;
    case 'list':
      return firstText(b.items.flat());
    case 'quote':
      return firstText(b.blocks);
    case 'code':
    case 'rule':
      return undefined;
    default: {
      const never: never = b;
      return never;
    }
  }
}

/** A sentence ends at . ! or ? before a space and a capital or a digit (so "e.g. this" and "v2.1" read on). */
const SENTENCE_END = /^(.+?[.!?])\s+(?=[A-Z0-9])/;

/**
 * Markdown (a trail's destination, which may be a whole document) as one plain line: its first sentence, cut at
 * `max` characters. Headings, lists, emphasis and links show as their words; code blocks and rules are skipped.
 */
export function summaryLine(markdown: string, max = 160): string {
  const text = firstText(parseMarkdown(markdown)) ?? '';
  const sentence = text.match(SENTENCE_END)?.[1] ?? text;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  const word = cut.lastIndexOf(' ');
  return `${(word > max / 2 ? cut.slice(0, word) : cut).trimEnd()}…`;
}
