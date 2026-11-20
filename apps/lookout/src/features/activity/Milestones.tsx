import { Cursor } from '../../components/ui';
import { hm } from '../../lib';
import type { Milestone } from './agentMilestones';

const WORDS = {
  claimed: 'Claimed',
  asked: 'Asked',
  answered: 'Answered',
  submitted: 'Submitted',
  rework: 'Rework',
  verified: 'Verified',
} as const;

/**
 * A lane's milestones in a row, each a small square and a word with its time: asked is rose only while the agent
 * still waits on you, answered and verified are green, rework a dashed outline. `working` ends the row with the
 * blaze cursor: the agent is at it now.
 */
export function Milestones(props: { items: Milestone[]; working: boolean }) {
  if (!props.items.length && !props.working) return null;
  return (
    <ol className="milestones">
      {props.items.map((m, i) => (
        <li key={`${m.kind}-${m.at}-${i}`} className={`ms ms-${m.kind}${m.open ? ' open' : ''}`}>
          <i aria-hidden="true" />
          {WORDS[m.kind]} <time>{hm(m.at)}</time>
          {m.open && <span> · waits on you</span>}
        </li>
      ))}
      {props.working && (
        <li className="ms ms-now">
          <Cursor label="Working now" />
        </li>
      )}
    </ol>
  );
}
