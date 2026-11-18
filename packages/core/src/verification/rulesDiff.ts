import type { DiffRule } from '../model/diffRule';
import type { VerificationConfig } from '../model/verification';

/** One rule as one comparable line: what triggers it, what it does, and why. */
export function ruleLine(r: DiffRule): string {
  const does = [...(r.check ? [`runs ${r.check}`] : []), ...(r.ask ? [`asks "${r.ask}"`] : [])].join(' and ');
  return `when ${r.when.join(', ')} changes: ${does} (why: ${r.why})`;
}

/**
 * The diff rules approving verification.json would add, change or remove, against the approved content, each in
 * full: a rule's check runs commands and its question holds up completions, so the trail lead reads every one.
 */
export function rulesDiff(before: VerificationConfig | undefined, after: VerificationConfig | undefined): string[] {
  const was = new Map((before?.rules ?? []).map((r) => [r.id, ruleLine(r)]));
  const now = new Map((after?.rules ?? []).map((r) => [r.id, ruleLine(r)]));
  const ids = [...new Set([...was.keys(), ...now.keys()])].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  return ids.flatMap((id) => {
    const a = was.get(id);
    const b = now.get(id);
    if (a === b) return [];
    if (a && b) return [`rule ${id}: ${a} → ${b}`];
    return b ? [`+ rule ${id}: ${b}`] : [`- rule ${id}: ${a}`];
  });
}
