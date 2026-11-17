import type { CheckFinding } from '@teamtrail/core';
import { FindingText } from './FindingText';

const SEVERITY: Record<CheckFinding['severity'], string> = { 'wont-run': "Won't run", unsure: 'May not run' };

/** The " · " between parts, as MetaLine has it. */
const SEP = <span className="sep"> · </span>;

/**
 * One finding as a quiet hint line that wraps: a dot (amber when it won't run, never red: it's advice), the
 * severity, the check when several are listed, and what reading the repo found. With `onFix`, a finding that knows
 * the command that runs offers it as its one action, and its text leaves the suggestion to that action.
 */
export function FindingLine(props: { finding: CheckFinding; named?: boolean; onFix?: (run: string[]) => void }) {
  const { finding: f, onFix } = props;
  const fix = onFix && f.fix;
  return (
    <li className={`cs-finding cs-finding-${f.severity} t-meta`}>
      <span className="cs-dot" aria-hidden="true" />
      <span>
        <span className="cs-severity">{SEVERITY[f.severity]}</span>
        {props.named && (
          <>
            {SEP}
            <code className="t-code">{f.check}</code>
          </>
        )}
        {SEP}
        <FindingText text={fix ? fix.problem : f.text} />
        {fix && (
          <>
            {SEP}
            <button type="button" className="d-more" onClick={() => onFix(fix.run)}>
              Use <code className="t-code">{fix.run.join(' ')}</code>
            </button>
          </>
        )}
      </span>
    </li>
  );
}
