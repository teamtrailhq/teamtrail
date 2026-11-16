import type { GuideAnswers, VerificationVerdict } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { hhmm } from '../../lib';
import { ChecklistAnswers } from '../guides';

const TEXT = { PASS: 'Passed', FAIL: 'Sent back', NEEDS_HUMAN: 'Needs you' } as const;

/** The guides a reviewer worked in, with their answers: a verdict's own, or the one guide of an older verdict. */
function guidesOf(v: VerificationVerdict): GuideAnswers[] {
  if (v.guides?.length) return v.guides;
  return v.guide ? [{ guide: v.guide, answers: v.checklist ?? [] }] : [];
}

/** A review or trail lead decision on an attempt, with its findings, and the reviewer's guides and checklists. */
export function ReviewVerdict({ verdict: v }: { verdict: VerificationVerdict }) {
  const guides = guidesOf(v);
  return (
    <div className={`vf-verdict v-${v.verdict.toLowerCase()}`}>
      <MetaLine
        parts={[
          { text: v.byKind === 'trail lead' && v.verdict === 'PASS' ? 'Approved' : TEXT[v.verdict], strong: true },
          { text: v.id, code: true },
          v.byKind === 'trail lead' ? v.by : `review ${v.by}`,
          v.sessionId && `session ${v.sessionId.slice(0, 8)}`,
          guides.length > 0 && `as ${guides.map((g) => `${g.guide.id} ${g.guide.version}`).join(', ')}`,
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
      {guides.map((g) => g.answers.length > 0 && <ChecklistAnswers key={g.guide.id} answers={g.answers} />)}
    </div>
  );
}
