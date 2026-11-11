import type { GuideFinding } from '@teamtrail/core';

/**
 * What the lint found in a guide file, each on its line. The lint looks for common problems only, so it never says
 * a guide is safe: the person reads the guide either way.
 */
export function LintFindings(props: { findings: GuideFinding[] }) {
  const advice = (
    <p className="t-meta">
      The lint looks for common problems; it isn't a review. Read the guide before you approve it.
    </p>
  );
  if (!props.findings.length)
    return (
      <>
        <p className="t-meta">The lint found none of the problems it looks for.</p>
        {advice}
      </>
    );
  return (
    <>
      <ul className="vf-findings guide-findings">
        {props.findings.map((f, i) => (
          <li key={i} className={`sev-${f.level}`}>
            <code className="t-code">line {f.line}</code> {f.message} <span className="t-meta">({f.rule})</span>
          </li>
        ))}
      </ul>
      {advice}
    </>
  );
}
