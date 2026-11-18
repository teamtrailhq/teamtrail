import { parseInline } from './parseInline';
import type { MdInline } from './types';

const plain = (nodes: MdInline[]): string =>
  nodes
    .map((n) => {
      switch (n.kind) {
        case 'text':
        case 'code':
          return n.text;
        case 'break':
          return ' ';
        case 'strong':
        case 'em':
        case 'del':
        case 'link':
          return plain(n.children);
        default: {
          const never: never = n;
          return never;
        }
      }
    })
    .join('');

/** Inline markdown as the words it shows: emphasis, code and links become their text. */
export const plainInline = (text: string) => plain(parseInline(text)).replace(/\s+/g, ' ').trim();
