/**
 * Path globs and model-id patterns, matched in time proportional to (pattern length × text length), whatever
 * the pattern: a table of "pattern from token i matches text from char j", filled from the end. The regex this
 * replaces backtracked: `**a` twelve times against forty a's took a minute and a half, and the patterns come
 * from agents (`touches`), committed files (policy, knowledge scope, models.json).
 */
type Token =
  | { kind: 'char'; c: string }
  /** `*`: any run of characters within one path segment (or of any characters, for `segments: false`). */
  | { kind: 'star' }
  /** `?`: one character, not a `/`. */
  | { kind: 'one' }
  /** `**` not followed by `/`: anything at all. */
  | { kind: 'deep' }
  /** `**` + `/`: zero or more whole folders. */
  | { kind: 'dirs' };

/** More wildcards than any real glob has: a pattern past this matches nothing. */
export const MAX_WILDCARDS = 64;

function tokenize(pattern: string, segments: boolean): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c !== '*' && !(c === '?' && segments)) out.push({ kind: 'char', c });
    else if (c === '?') out.push({ kind: 'one' });
    else if (!segments || pattern[i + 1] !== '*') out.push({ kind: segments ? 'star' : 'deep' });
    else {
      const dirs = pattern[i + 2] === '/';
      i += dirs ? 2 : 1;
      out.push({ kind: dirs ? 'dirs' : 'deep' });
    }
  }
  return collapse(out);
}

/** Runs of `**`, `**`/ and (outside segments) `*` match the same as one: kept as one, so the table stays small. */
function collapse(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const t of tokens) {
    const prev = out.at(-1);
    if (prev?.kind === 'dirs' && t.kind === 'dirs') continue;
    if (prev?.kind === 'deep' && (t.kind === 'deep' || t.kind === 'dirs')) continue;
    if (prev?.kind === 'dirs' && t.kind === 'deep') out[out.length - 1] = t;
    else out.push(t);
  }
  return out;
}

/** One row of the table: does the pattern from token `t` on match the text from each position on? */
function row(t: Token, next: Uint8Array, text: string): Uint8Array {
  const n = text.length;
  const cur = new Uint8Array(n + 1);
  let dirsAhead = 0;
  for (let j = n; j >= 0; j--) {
    const here = j < n ? text[j] : '';
    switch (t.kind) {
      case 'char':
        cur[j] = j < n && here === t.c ? next[j + 1] : 0;
        break;
      case 'one':
        cur[j] = j < n && here !== '/' ? next[j + 1] : 0;
        break;
      case 'star':
        cur[j] = next[j] || (j < n && here !== '/' ? cur[j + 1] : 0);
        break;
      case 'deep':
        cur[j] = next[j] || (j < n ? cur[j + 1] : 0);
        break;
      case 'dirs':
        if (j < n && here === '/' && next[j + 1]) dirsAhead = 1;
        cur[j] = next[j] || dirsAhead;
        break;
      default:
        return t satisfies never;
    }
  }
  return cur;
}

/** Whether the whole of `text` matches the whole of `pattern`. `segments`: `*` stops at `/` (path globs). */
export function wildcardMatch(pattern: string, text: string, opts: { segments: boolean }): boolean {
  const tokens = tokenize(pattern, opts.segments);
  if (tokens.filter((t) => t.kind !== 'char').length > MAX_WILDCARDS) return false;
  let next = new Uint8Array(text.length + 1);
  next[text.length] = 1;
  for (let i = tokens.length - 1; i >= 0; i--) next = row(tokens[i], next, text);
  return next[0] === 1;
}
