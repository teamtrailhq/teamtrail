import type { DeliveryProblem } from '@teamtrail/core';

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Messages Slack refused for good (an archived channel, Scout removed): why, and since when. Amber: held up. */
export function DeliveryLine({ problem }: { problem: DeliveryProblem }) {
  const count = problem.failures === 1 ? 'A message was' : `${problem.failures} messages were`;
  return (
    <div className="test-line warn" title={problem.code}>
      {count} not delivered (last {time(problem.at)}). {problem.message}
    </div>
  );
}
