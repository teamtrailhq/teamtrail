import type { VerificationAttempt } from '@teamtrail/core';

/**
 * What the check guard found on a completion: each change to what its checks run, or to their tests. Held (the
 * checks passed, the pass waits for you) or only observed.
 */
export function GuardFindings({ attempt: a }: { attempt: VerificationAttempt }) {
  const g = a.guard;
  if (!g?.findings.length) return null;
  const held = g.mode === 'enforce' && a.result === 'pass';
  return (
    <div className={`vf-guard${held ? ' held' : ''}`}>
      <p className="vf-guard-head">
        {held ? 'Checks passed, but the work changed what they run' : 'The work changed what its checks run'}
      </p>
      <ul>
        {g.findings.map((f) => (
          <li key={`${f.file}\0${f.text}`}>
            {f.text}
            {f.check && <span className="dim"> · {f.check}</span>}
          </li>
        ))}
      </ul>
      {held && <p className="t-meta">The pass counts once you accept it.</p>}
    </div>
  );
}
