import type { CheckFinding } from '@teamtrail/core';
import type { ReactNode } from 'react';
import { FindingText } from './FindingText';

const SEVERITY: Record<CheckFinding['severity'], string> = { 'wont-run': "Won't run", unsure: 'May not run' };

/**
 * What reading the repo says about a check's command (verification/screenChecks.ts in core): one quiet line per
 * finding, `Won't run` ones on an amber edge, never red (it's advice, nothing waits on it), then any actions.
 */
export function CheckFindingList(props: { findings: CheckFinding[]; named?: boolean; actions?: ReactNode }) {
  if (!props.findings.length) return null;
  return (
    <div className="vf-findings">
      <ul>
        {props.findings.map((f) => (
          <li key={`${f.check} ${f.text}`} className={`t-meta vf-finding vf-finding-${f.severity}`}>
            {SEVERITY[f.severity]}
            {props.named ? (
              <>
                {' · '}
                <code className="t-code">{f.check}</code>
              </>
            ) : null}
            {' · '}
            <FindingText text={f.text} />
          </li>
        ))}
      </ul>
      {props.actions && <div className="vf-finding-actions">{props.actions}</div>}
    </div>
  );
}
