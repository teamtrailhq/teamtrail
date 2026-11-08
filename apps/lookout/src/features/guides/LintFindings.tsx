import type { GuideFinding } from '@teamtrail/core';

/** What the safety lint found in a guide file, each on its line. */
export function LintFindings(props: { findings: GuideFinding[] }) {
  if (!props.findings.length) return <p className="t-meta">The safety lint found nothing.</p>;
  return (
    <ul className="vf-findings guide-findings">
      {props.findings.map((f, i) => (
        <li key={i} className={`sev-${f.level}`}>
          <code className="t-code">line {f.line}</code> {f.message} <span className="t-meta">({f.rule})</span>
        </li>
      ))}
    </ul>
  );
}
