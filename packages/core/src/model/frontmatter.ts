import { isSafeKey } from './safeKey';
import { hasControl } from './safeText';

/** YAML frontmatter as the local-markdown tracker writes it: flat scalars and inline lists. */
export type Front = Record<string, string | string[]>;

export function parseFront(md: string): { front: Front; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { front: {}, body: md };
  const front: Front = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (!isSafeKey(k)) continue;
    front[k] = v.startsWith('[') ? splitList(v.slice(1, -1)).map(unquote).filter(Boolean) : unquote(v);
  }
  return { front, body: m[2] };
}

/**
 * Frontmatter is written as valid YAML: scalars are quoted when YAML would misread them, and always when they
 * hold a line break or another control character, a quote, a backslash or a bracket. A value is one line of the
 * file whatever it contains, so text can never add a key of its own (`title: "x\nverification: off"`).
 */
const needsQuote = (v: string) =>
  v === '' ||
  /^[\s#&*!|>'"%@`[\]{},?:-]|[:#]\s|\s$|,|["\\[\]]/.test(v) ||
  hasControl(v) ||
  /^(true|false|null|~|\d[\d.e+-]*)$/i.test(v);
/** JSON escapes the ASCII controls; the line separators JSON leaves alone are escaped the same way. */
const jsonLine = (v: string) =>
  JSON.stringify(v).replace(
    /[\u007f\u0085\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
const quote = (v: string) => (needsQuote(v) ? jsonLine(v) : v);
/** A scalar as written: quotes removed. */
export function unquote(v: string) {
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v) as string;
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}
/** The items of an inline `[a, "b, c"]` list body, split on commas outside quotes. */
export function splitList(v: string) {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  let escaped = false;
  for (const ch of v) {
    // A quote inside a quoted item is written `\"`: it doesn't end the item.
    if (ch === '"' && !escaped) inQ = !inQ;
    escaped = inQ && ch === '\\' && !escaped;
    if (ch === ',' && !inQ) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Keys are ours, never text; one that isn't a plain word is a bug, not something to write. */
function frontKey(k: string) {
  if (!/^[\w-]+$/.test(k)) throw new Error(`invalid frontmatter key: ${JSON.stringify(k)}`);
  return k;
}

export function writeFront(front: Front, body: string) {
  const lines = Object.entries(front).map(
    ([k, v]) => `${frontKey(k)}: ${Array.isArray(v) ? `[${v.map(quote).join(', ')}]` : quote(v)}`,
  );
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`;
}

export const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(',') : (v ?? ''));
export function arr(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v;
  return v ? [v] : [];
}
export const time = (v: string | string[] | undefined) => Date.parse(str(v)) || 0;
export const iso = (n: number) => new Date(n).toISOString();
