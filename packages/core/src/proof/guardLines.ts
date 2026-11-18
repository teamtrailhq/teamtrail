import type { Proof } from '../model/proof';

const SHOWN = 10;

function statusOf(mode: NonNullable<Proof['guard']>['mode'], passed: boolean) {
  if (mode === 'observe') return 'observed, not held';
  return passed ? 'held for the trail lead' : 'the checks failed anyway';
}

/**
 * The check guard's part of a proof as a pull request shows it: what the work changed of what its checks run, and
 * whether the trail lead accepted the pass anyway. `md` escapes text the way the rest of the proof does.
 */
export function guardLines(p: Proof, md: (text: string, max?: number) => string): string[] {
  const g = p.guard;
  if (!g) return [];
  const accepted = g.accepted && `accepted by ${md(g.accepted.by, 60)}: ${md(g.accepted.reason)}`;
  const status = accepted ?? statusOf(g.mode, p.attempt.result === 'pass');
  const more = g.findings.length > SHOWN ? [`- and ${g.findings.length - SHOWN} more`] : [];
  return [
    '',
    `**Changed what its checks run** (${status}):`,
    ...g.findings.slice(0, SHOWN).map((f) => `- ${md(f)}`),
    ...more,
  ];
}
