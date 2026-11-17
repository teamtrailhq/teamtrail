import type { CheckFinding } from '@teamtrail/core';
import type { ReactNode } from 'react';
import { FindingLine } from './FindingLine';

/**
 * What reading the repo says about a check's command (verification/screenChecks.ts in core): one quiet hint line
 * per finding, right under what it's about, then any action for them all. `named` lists the check of each (several
 * checks at once); `onFix` lets a finding that knows the command that runs offer it.
 */
export function CheckFindingList(props: {
  findings: CheckFinding[];
  named?: boolean;
  onFix?: (run: string[]) => void;
  action?: ReactNode;
}) {
  if (!props.findings.length) return null;
  return (
    <div className="cs-findings">
      <ul>
        {props.findings.map((f) => (
          <FindingLine key={`${f.check} ${f.text}`} finding={f} named={props.named} onFix={props.onFix} />
        ))}
      </ul>
      {props.action}
    </div>
  );
}
