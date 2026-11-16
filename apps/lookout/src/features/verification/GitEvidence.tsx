import type { VerificationAttempt } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';

const short = (sha?: string | null) => sha?.slice(0, 8) ?? 'none';
const count = (n: number | null) => (n === null ? '·' : String(n));

/** What git showed of the completion: base → head on a branch, the files changed since the claim, and the flags. */
export function GitEvidence({ attempt }: { attempt: VerificationAttempt }) {
  const g = attempt.git;
  if (!g) return null;
  const { files, add, del } = g.stats;
  const outside = new Set(g.flags.find((f) => f.kind === 'outside-scope')?.files ?? []);
  return (
    <div className="vf-git">
      <MetaLine
        parts={[
          g.tree
            ? { text: `${g.base ? `${short(g.base.head)} → ` : ''}${short(g.tree.head)}`, code: true }
            : 'not a git repo',
          g.tree && { text: g.tree.branch ?? 'detached HEAD', code: !!g.tree.branch },
          g.tree && `${files} file${files === 1 ? '' : 's'} +${add} −${del}`,
        ]}
      />
      {g.flags
        .filter((f) => f.kind !== 'no-git')
        .map((f) => (
          <p key={f.kind} className={`vf-flag lv-${f.level}`} title={f.files?.join('\n')}>
            <span className="t-code">{f.kind}</span> {f.message}
          </p>
        ))}
      {g.changed.length > 0 && (
        <details className="vf-files">
          <summary className="t-label">Changed files</summary>
          <ul>
            {g.changed.map((c) => (
              <li key={c.path}>
                <code>{c.path}</code>
                <span className="dim">
                  {c.untracked ? 'new' : `+${count(c.add)} −${count(c.del)}`}
                  {c.dirtyAtClaim ? ' · dirty at claim' : ''}
                  {outside.has(c.path) ? ' · outside the declared files' : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
