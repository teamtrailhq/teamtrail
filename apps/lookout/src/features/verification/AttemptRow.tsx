import type { VerificationAttempt } from '@teamtrail/core';
import { MetaLine, Pill } from '../../components/ui';
import { dur, hhmm } from '../../lib';
import { RESULT_TEXT } from '../../lib/verification';
import { CheckRow } from './CheckRow';
import { GitEvidence } from './GitEvidence';
import { GuardFindings } from './GuardFindings';
import { OutOfScopeChecks } from './OutOfScopeChecks';

/** One completion claim: result chip, who and when, what was claimed, then each check, and those it didn't run. */
export function AttemptRow({ attempt: a, latest }: { attempt: VerificationAttempt; latest: boolean }) {
  return (
    <details className={`vf-attempt r-${a.result}`} open={latest}>
      <summary>
        <Pill tone="state" className={`r-${a.result}`}>
          {RESULT_TEXT[a.result]}
        </Pill>
        <MetaLine
          parts={[{ text: a.id, code: true }, a.agent, hhmm(a.submittedAt), dur(a.finishedAt - a.submittedAt)]}
        />
      </summary>
      <p className="vf-claim">{a.summary ?? a.resolution}</p>
      {/* a pass the guard held says why in its findings: once is enough */}
      {a.note && !(a.result === 'pass' && a.guard) && <p className="vf-note">{a.note}</p>}
      <GuardFindings attempt={a} />
      {a.criteria && (
        <ul className="vf-criteria">
          {a.criteria.lines.map((l) => (
            <li key={l} className={criterionClass(l)}>
              {l}
            </li>
          ))}
        </ul>
      )}
      <GitEvidence attempt={a} />
      {a.checks.map((c) => (
        <CheckRow key={c.name} check={c} />
      ))}
      <OutOfScopeChecks attempt={a} />
    </details>
  );
}

/**
 * A criteria line reads `AC-1 ✓ …` when a check here proved it, `AC-1 ✗ …` when not, `AC-1 ? …` when it rests on
 * the agent's word (claimed, not verified); anything else is still waiting.
 */
function criterionClass(line: string) {
  if (line.includes(' ✓ ')) return 'ok';
  if (line.includes(' ✗ ')) return 'bad';
  if (line.includes(' ? ')) return 'claimed';
  return 'wait';
}
