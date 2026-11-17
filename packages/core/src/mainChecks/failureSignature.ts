/*
 * What makes two failures of a check "the same": the lines of its output that name a failure, with what changes from
 * run to run taken out (the checkout's folder, numbers, colours). A later run fails the same way when every such line
 * it prints was already printed on main: a new failing test is a new line, so it is never mistaken for a known one.
 */

const FAILURE = /\b(fail(s|ed|ure|ures|ing)?|errors?|assert(ion)?(error)?|exception|panic(ked)?)\b|✗|×|✕|✖/i;
// colour codes: ESC, then `[`, parameters and a letter
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');
const MAX_LINES = 200;

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One line as compared: the checkout's folder as `<repo>`, numbers as `#`, spaces collapsed. */
function normalized(line: string, folders: string[]) {
  let s = line.replace(ANSI, '');
  for (const f of folders) s = s.replace(new RegExp(escaped(f), 'g'), '<repo>');
  return s
    .replace(/\b[0-9a-f]{7,40}\b/g, '<sha>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The normalized lines of `text` that name a failure, each once, in order. */
export function failureSignature(text: string, folders: string[] = []): string[] {
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (!FAILURE.test(line.replace(ANSI, ''))) continue;
    const n = normalized(line, folders);
    if (n) seen.add(n);
    if (seen.size >= MAX_LINES) break;
  }
  return [...seen];
}

/** The last non-empty lines of `text`, normalized: compared when the output names no failure at all. */
export function lastLines(text: string, folders: string[] = [], n = 10): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => normalized(l, folders))
    .filter(Boolean)
    .slice(-n);
}

/** The signature a failed check is kept with: its failure lines, or its last lines when it names none. */
export function signatureOf(text: string, folders: string[] = []): string[] {
  const lines = failureSignature(text, folders);
  return lines.length ? lines : lastLines(text, folders).map((l) => `last: ${l}`);
}

/** True when `now` (a signature) fails the way `known` did: nothing in it that main didn't print. */
export function sameSignature(known: string[], now: string[]): boolean {
  if (!now.length) return false;
  const was = new Set(known);
  return now.every((l) => was.has(l));
}
