import type { ChecklistAnswer, VerificationVerdict } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { hhmm } from '../../lib';
import { ChecklistAnswers } from '../guides';

const TEXT = { PASS: 'Passed', FAIL: 'Sent back', NEEDS_HUMAN: 'Needs you' } as const;

/** What a reviewer working in a guide adds to its verdict; older verdicts have neither. */
type WithGuide = { guide?: { id: string; version: string }; checklist?: ChecklistAnswer[] };

/** A review or trail lead decision on an attempt, with its findings, and the reviewer's guide and checklist. */
export function ReviewVerdict({ verdict: v }: { verdict: VerificationVerdict }) {
  const { guide, checklist } = v as VerificationVerdict & WithGuide;
  return (
    <div className={`vf-verdict v-${v.verdict.toLowerCase()}`}>
      <MetaLine
        parts={[
          { text: v.byKind === 'trail lead' && v.verdict === 'PASS' ? 'Approved' : TEXT[v.verdict], strong: true },
          { text: v.id, code: true },
          v.byKind === 'trail lead' ? v.by : `review ${v.by}`,
          v.sessionId && `session ${v.sessionId.slice(0, 8)}`,
          guide && `as ${guide.id} ${guide.version}`,
          `on ${v.attemptId}`,
          hhmm(v.at),
        ]}
      />
      <p>{v.summary}</p>
      {v.findings.length > 0 && (
        <ul className="vf-findings">
          {v.findings.map((f, i) => (
            <li key={i} className={`sev-${f.severity}`}>
              {f.path && <code>{f.line ? `${f.path}:${f.line}` : f.path}</code>} {f.text}
            </li>
          ))}
        </ul>
      )}
      {checklist && checklist.length > 0 && <ChecklistAnswers answers={checklist} />}
    </div>
  );
}
