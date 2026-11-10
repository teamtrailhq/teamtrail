import { BRAND } from './brand';

/*
 * Reading the `<!-- teamtrail:<name> <payload> -->` markers Teamtrail writes, only where it writes them: the
 * very end of an issue body or decision comment, or the first lines of a comment. A marker anywhere else is text.
 * Plain string searches, so the time taken grows with the length of the body and nothing else: these run on
 * every refetch, over text anyone in the tracker can write.
 */
const P = BRAND.labelPrefix;
const CLOSE = ' -->';
/** A payload longer than this isn't one of ours (decision records are trimmed to fit a comment; meta is tiny). */
const MAX_PAYLOAD = 70_000;

const opener = (name: string) => `<!-- ${P}:${name} `;

/** JSON inside an HTML comment never contains `--`, so it can't close the comment or open another marker. */
export const markerJson = (value: unknown) => JSON.stringify(value).replace(/--/g, '-\\u002d');

export const marker = (name: string, payload: string) => `${opener(name)}${payload}${CLOSE}`;

/** The marker that ends `body` (trailing whitespace aside), and the text before it. */
export function trailingMarker(body: string, name: string): { before: string; payload: string } | undefined {
  const end = body.trimEnd();
  if (!end.endsWith(CLOSE)) return undefined;
  const open = opener(name);
  const at = end.lastIndexOf(open);
  if (at === -1 || end.length - at > MAX_PAYLOAD) return undefined;
  return { before: end.slice(0, at), payload: end.slice(at + open.length, -CLOSE.length) };
}

/** The marker `body` starts with, when it sits on the first line, and the text from the next line on. */
export function leadingMarker(body: string, name: string): { payload: string; rest: string } | undefined {
  const open = opener(name);
  if (!body.startsWith(open)) return undefined;
  const newline = body.indexOf('\n');
  const line = newline === -1 ? body : body.slice(0, newline);
  const close = line.indexOf(CLOSE, open.length);
  if (close <= open.length) return undefined;
  const after = body.slice(close + CLOSE.length);
  return { payload: line.slice(open.length, close), rest: after.startsWith('\n') ? after.slice(1) : after };
}
