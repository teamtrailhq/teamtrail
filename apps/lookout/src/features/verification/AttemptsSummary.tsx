import { Disclosure, MetaLine } from '../../components/ui';
import { hhmm } from '../../lib';
import { RESULT_TEXT, type TicketVerification } from '../../lib/verification';
import { AttemptRow } from './AttemptRow';
import { ReviewVerdict } from './ReviewVerdict';

const VERDICT = { PASS: 'review passed', FAIL: 'review sent it back', NEEDS_HUMAN: 'reviewer asked for you' } as const;

/**
 * In the inspector's Progress section: how many completions the agents submitted and how the latest went, with
 * every verdict and attempt (claims, checks, git evidence) behind Details. Nothing before the first completion.
 */
export function AttemptsSummary({ data }: { data: TicketVerification }) {
  const latest = data.attempts[0];
  if (!latest) return null;
  const n = data.attempts.length;
  const verdict = data.verdicts.find((v) => v.attemptId === latest.id);
  return (
    <>
      <span className="t-body">
        {n} {n === 1 ? 'attempt' : 'attempts'} · latest {RESULT_TEXT[latest.result].toLowerCase()}
      </span>
      <MetaLine
        parts={[
          { text: latest.id, code: true },
          latest.agent,
          hhmm(latest.submittedAt),
          verdict && VERDICT[verdict.verdict],
        ]}
      />
      <Disclosure>
        <div className="vf-panel">
          {data.verdicts.map((v) => (
            <ReviewVerdict key={v.id} verdict={v} />
          ))}
          {data.attempts.map((a, i) => (
            <AttemptRow key={a.id} attempt={a} latest={i === 0} />
          ))}
        </div>
      </Disclosure>
    </>
  );
}
