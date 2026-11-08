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
    front[k] = v.startsWith('[') ? splitList(v.slice(1, -1)).map(unquote).filter(Boolean) : unquote(v);
  }
  return { front, body: m[2] };
}

/** Frontmatter is written as valid YAML: scalars are quoted when YAML would misread them. */
const needsQuote = (v: string) =>
  v === '' || /^[\s#&*!|>'"%@`[\]{},?:-]|[:#]\s|\s$|,/.test(v) || /^(true|false|null|~|\d[\d.e+-]*)$/i.test(v);
const quote = (v: string) => (needsQuote(v) ? JSON.stringify(v) : v);
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
  for (const ch of v) {
    if (ch === '"') inQ = !inQ;
    if (ch === ',' && !inQ) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function writeFront(front: Front, body: string) {
  const lines = Object.entries(front).map(
    ([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.map(quote).join(', ')}]` : quote(v)}`,
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
