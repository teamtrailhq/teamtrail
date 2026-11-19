import type { VerificationAttempt } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';

/** The checks an attempt didn't run because the change was outside their paths, each with why. */
export function OutOfScopeChecks({ attempt }: { attempt: VerificationAttempt }) {
  if (!attempt.outOfScope?.length) return null;
  return (
    <ul className="vf-out-of-scope">
      {attempt.outOfScope.map((c) => (
        <li key={c.name}>
          <MetaLine parts={[{ text: c.name, code: true }, `not run: ${c.reason}`]} />
        </li>
      ))}
    </ul>
  );
}
