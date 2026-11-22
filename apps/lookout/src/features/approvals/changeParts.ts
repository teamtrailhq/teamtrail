/** A changed line of an approval's diff, split for reading: what it is, what it was, and what it becomes. */
export type ChangeParts = { head: string; was: string; now: string };

/**
 * Splits `name: old → new` (core's checksDiff, setupDiff, rulesDiff) at its first ` → `, the name up to the first
 * `: `. A command shown as a command line never holds ` → ` (commandLine.ts writes it as JSON then).
 */
export function changeParts(text: string): ChangeParts {
  const arrow = text.indexOf(' → ');
  const left = text.slice(0, arrow);
  const colon = left.indexOf(': ');
  const head = colon < 0 ? '' : left.slice(0, colon + 2);
  return { head, was: left.slice(head.length), now: text.slice(arrow + 3) };
}
