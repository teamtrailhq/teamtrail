import { webUrl } from '@teamtrail/core';
import type { MdInline } from './types';

/** Past this nesting or length, text stays text: no input recurses or scans without end. */
const MAX_DEPTH = 6;
const MAX_LENGTH = 20_000;
const ESCAPABLE = /[\\`*_{}[\]()#+\-.!~<>|]/;
const BARE_URL = /https?:\/\/[^\s<>]+/y;
const TRAILING = /[.,;:!?'")\]]+$/;
/** How far a `[` looks for its `]`. */
const MAX_LABEL = 1_000;

interface Ctx {
  depth: number;
  /** Inside a link's label: no link in a link. */
  inLink: boolean;
}

/** What a token read: nodes to add, or text to run on with the plain text around it. */
type Token = { nodes: MdInline[]; next: number } | { text: string; next: number };

/**
 * Inline markdown as agents write it: `code`, **strong**, *em*, ~~struck~~, [links](https://…), <https://…> and bare
 * http(s) URLs, backslash escapes and line breaks. A link is a link only when `webUrl` accepts its URL; otherwise
 * its label is plain text. An image is its alt text, and HTML stays text: nothing here loads or runs anything.
 */
export function parseInline(text: string, ctx: Ctx = { depth: 0, inLink: false }): MdInline[] {
  if (text.length > MAX_LENGTH || ctx.depth > MAX_DEPTH) return [{ kind: 'text', text }];
  const out: MdInline[] = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
    const token = readToken(text, i, ctx);
    if (!token) {
      plain += text[i++];
      continue;
    }
    i = token.next;
    if ('text' in token) {
      plain += token.text;
      continue;
    }
    if (plain) out.push({ kind: 'text', text: plain });
    plain = '';
    out.push(...token.nodes);
  }
  if (plain) out.push({ kind: 'text', text: plain });
  return out;
}

function readToken(text: string, i: number, ctx: Ctx): Token | undefined {
  const c = text[i];
  switch (c) {
    case '\\':
      return escape(text, i);
    case '\n':
      return { nodes: [{ kind: 'break' }], next: i + 1 };
    case '`':
      return codeSpan(text, i);
    case '*':
    case '_':
      return emphasis(text, i, ctx);
    case '~':
      return text[i + 1] === '~' ? delimited({ text, i, ctx, size: 2 }) : undefined;
    case '!':
      return text[i + 1] === '[' ? image(text, i, ctx) : undefined;
    case '[':
      return link(text, i, ctx);
    case '<':
      return autolink(text, i, ctx);
    case 'h':
      return bareUrl(text, i, ctx);
    default:
      return undefined;
  }
}

function escape(text: string, i: number): Token | undefined {
  const next = text[i + 1];
  if (next === '\n') return { nodes: [{ kind: 'break' }], next: i + 2 };
  return next && ESCAPABLE.test(next) ? { text: next, next: i + 2 } : undefined;
}

function codeSpan(text: string, i: number): Token {
  let size = 1;
  while (text[i + size] === '`') size++;
  const run = '`'.repeat(size);
  const end = text.indexOf(run, i + size);
  if (end < 0) return { text: run, next: i + size };
  let code = text.slice(i + size, end).replace(/\n/g, ' ');
  if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ')) code = code.slice(1, -1);
  return { nodes: [{ kind: 'code', text: code }], next: end + size };
}

function emphasis(text: string, i: number, ctx: Ctx): Token | undefined {
  const c = text[i];
  // snake_case stays as it is
  if (c === '_' && /\w/.test(text[i - 1] ?? '')) return undefined;
  const size = text[i + 1] === c ? 2 : 1;
  return delimited({ text, i, ctx, size });
}

/** `**strong**`, `*em*` (or with `_`) and `~~struck~~`: an opener not followed by a space, up to its closer. */
function delimited(p: { text: string; i: number; ctx: Ctx; size: 1 | 2 }): Token | undefined {
  const { text, i, size } = p;
  const c = text[i];
  const start = i + size;
  if (!text[start] || /\s/.test(text[start])) return undefined;
  const end = closer({ text, from: start, c, size });
  if (end < 0) return undefined;
  const children = parseInline(text.slice(start, end), { ...p.ctx, depth: p.ctx.depth + 1 });
  if (c === '~') return { nodes: [{ kind: 'del', children }], next: end + size };
  return { nodes: [{ kind: size === 2 ? 'strong' : 'em', children }], next: end + size };
}

/** Where the closing delimiter starts: a run of exactly `size` (or of three, for ***both***), not after a space. */
function closer(p: { text: string; from: number; c: string; size: 1 | 2 }) {
  const { text, c, size } = p;
  let k = text.indexOf(c, p.from + 1);
  while (k >= 0) {
    let run = 1;
    while (text[k + run] === c) run++;
    const fits = run === size || run >= 3;
    const intraword = c === '_' && /\w/.test(text[k + run] ?? '');
    if (fits && !/\s/.test(text[k - 1]) && !intraword) return k + run - size;
    k = text.indexOf(c, k + run);
  }
  return -1;
}

/** `[label](url)`: a link when `webUrl` accepts the URL, else the label alone. */
function link(text: string, i: number, ctx: Ctx): Token | undefined {
  const target = linkTarget(text, i);
  if (!target) return undefined;
  const children = parseInline(target.label, { depth: ctx.depth + 1, inLink: true });
  const href = ctx.inLink ? undefined : webUrl(target.url);
  if (!href) return { nodes: children, next: target.next };
  return { nodes: [{ kind: 'link', href, children }], next: target.next };
}

/** `![alt](url)`: never loaded, its alt text only. */
function image(text: string, i: number, ctx: Ctx): Token | undefined {
  const target = linkTarget(text, i + 1);
  if (!target) return undefined;
  return { nodes: parseInline(target.label, { depth: ctx.depth + 1, inLink: true }), next: target.next };
}

function linkTarget(text: string, i: number) {
  const close = matching({ text, i, open: '[', shut: ']' });
  if (close < 0 || text[close + 1] !== '(') return undefined;
  const end = matching({ text, i: close + 1, open: '(', shut: ')' });
  if (end < 0) return undefined;
  const target =
    text
      .slice(close + 2, end)
      .trim()
      .split(/\s+/)[0] ?? '';
  const url = target.replace(/^<(.*)>$/, '$1');
  return { label: text.slice(i + 1, close), url, next: end + 1 };
}

/** The bracket that closes the one at `i`, nested ones and escapes skipped, within MAX_LABEL; -1 when none. */
function matching(p: { text: string; i: number; open: string; shut: string }) {
  const { text, open, shut } = p;
  let depth = 0;
  const end = Math.min(text.length, p.i + MAX_LABEL);
  for (let k = p.i; k < end; k++) {
    if (text[k] === '\\') k++;
    else if (text[k] === open) depth++;
    else if (text[k] === shut && --depth === 0) return k;
  }
  return -1;
}

/** `<https://…>`. Anything else in angle brackets, HTML too, stays text. */
function autolink(text: string, i: number, ctx: Ctx): Token | undefined {
  const end = text.indexOf('>', i + 1);
  if (end < 0) return undefined;
  const url = text.slice(i + 1, end);
  const href = !ctx.inLink && !/\s/.test(url) ? webUrl(url) : undefined;
  return href ? { nodes: [{ kind: 'link', href, children: [{ kind: 'text', text: url }] }], next: end + 1 } : undefined;
}

/** A bare http(s) URL, at the start of a word; trailing punctuation stays out of it. */
function bareUrl(text: string, i: number, ctx: Ctx): Token | undefined {
  if (ctx.inLink || /[^\s(]/.test(text[i - 1] ?? ' ')) return undefined;
  BARE_URL.lastIndex = i;
  const found = BARE_URL.exec(text)?.[0].replace(TRAILING, '');
  const href = found ? webUrl(found) : undefined;
  if (!found || !href) return undefined;
  return { nodes: [{ kind: 'link', href, children: [{ kind: 'text', text: found }] }], next: i + found.length };
}
