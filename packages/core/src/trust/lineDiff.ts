const MAX_LINES = 14;
const clip = (lines: string[]) =>
  lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `… ${lines.length - MAX_LINES} more lines`] : lines;

/** The first lines of `text`, for showing what an approval would cover. */
export const firstLines = (text: string) => clip(text.split('\n').filter((l) => l.trim()));

/**
 * What changed between two texts, line by line: `- ` for lines only the approved one has, `+ ` for lines only the
 * current one has, in the current order. Enough to see what an edit did; not a minimal diff.
 */
export function lineDiff(approved: string, current: string): string[] {
  const before = approved.split('\n').filter((l) => l.trim());
  const after = current.split('\n').filter((l) => l.trim());
  const had = new Set(before);
  const has = new Set(after);
  const removed = before.filter((l) => !has.has(l)).map((l) => `- ${l}`);
  const added = after.filter((l) => !had.has(l)).map((l) => `+ ${l}`);
  return clip([...removed, ...added]);
}
