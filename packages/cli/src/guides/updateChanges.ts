import type { GuideDoc } from '@teamtrail/core';
import { argvLine } from './argvLine';

/** Lines only in `before` (`- `) and only in `after` (`+ `), in full: what an update changes in the text. */
function textChanges(before: string, after: string): string[] {
  const was = before.split('\n');
  const now = after.split('\n');
  const had = new Set(was);
  const has = new Set(now);
  const removed = was.filter((l) => l.trim() && !has.has(l)).map((l) => `    - ${l}`);
  const added = now.filter((l) => l.trim() && !had.has(l)).map((l) => `    + ${l}`);
  return [...removed, ...added];
}

function checkChanges(before: GuideDoc | undefined, after: GuideDoc): string[] {
  const old = before?.proposedChecks ?? {};
  const names = [...new Set([...Object.keys(old), ...Object.keys(after.proposedChecks)])];
  return names.flatMap((name) => {
    const was = old[name];
    const now = after.proposedChecks[name];
    if (!now) return [`    ${name}: removed (it stays in verification.json until you edit it)`];
    if (!was) return [`    ${name}: new, ${argvLine(now)}; asked about on its own`];
    if (argvLine(was) === argvLine(now)) return [];
    return [`    ${name}: ${argvLine(was)} → ${argvLine(now)}; asked about on its own`];
  });
}

/**
 * What `guides update` would change, for the person to read before saying yes: the check commands that are new,
 * changed or gone, the required checks, and every line of the file that differs. `before` is the installed file only
 * when it is the version approved here; otherwise the whole new guide (shown above it) is all there is to compare.
 */
export function updateChanges(input: { before?: { text: string; guide?: GuideDoc }; text: string; guide: GuideDoc }) {
  const { before, guide } = input;
  const checks = checkChanges(before?.guide, guide);
  const wasRequired = before?.guide?.requiresChecks.join(', ') || 'none';
  const required = guide.requiresChecks.join(', ') || 'none';
  const lines = [
    '  What changes:',
    ...(checks.length ? ['  Check commands:', ...checks] : ['  Check commands: unchanged']),
    ...(wasRequired === required ? [] : [`  Required checks: ${wasRequired} → ${required}`]),
  ];
  if (!before) return [...lines, "  Text: the installed file isn't the version approved here, so read all of it above"];
  const text = textChanges(before.text, input.text);
  return [...lines, `  Text (${text.length} lines differ):`, ...text];
}
