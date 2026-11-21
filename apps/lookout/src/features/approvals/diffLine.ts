/** One line of what an approval covers, read for the diff: added, removed, changed in place, or context. */
export type DiffLine = { kind: 'add' | 'rm' | 'change' | 'same'; gutter: string; text: string };

/**
 * Reads a line of the approval's diff (core's `lineDiff`, `checksDiff`, `rulesDiff`, `setupDiff`): `+ ` added,
 * `- ` removed, `a → b` changed in place, anything else context. Only for diffs: content shown whole (a file nobody
 * committed) is never read this way, since a YAML list item starts with `- ` too.
 */
export function diffLine(line: string): DiffLine {
  if (line.startsWith('+ ')) return { kind: 'add', gutter: '+', text: line.slice(2) };
  if (line.startsWith('- ')) return { kind: 'rm', gutter: '−', text: line.slice(2) };
  if (line.includes(' → ')) return { kind: 'change', gutter: '~', text: line };
  return { kind: 'same', gutter: '', text: line };
}
