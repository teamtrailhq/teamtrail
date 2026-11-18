import type { GapAction, GapStanding } from '@teamtrail/core';
import { Button, type MenuItem, MetaLine } from '../../components/ui';

/**
 * Why a proof isn't verified, one gap a line: what's missing, then who is on it (an agent, main, you, nobody), with
 * the action that closes it when it's the human's. Without a plan (an older server) the gaps' lines alone.
 */
export function ProofGapList(props: { gaps: string[]; plan?: GapStanding[]; actions?: Map<GapAction, MenuItem> }) {
  const plan = props.plan ?? props.gaps.map((text) => ({ text, status: undefined, action: undefined }));
  if (!plan.length) return null;
  return (
    <ul className="proof-gaps proof-gap-list">
      {plan.map((g) => {
        const item = g.action && props.actions?.get(g.action);
        return (
          <li key={g.text} className="proof-gap">
            <span className="t-body">{g.text}</span>
            {g.status && <MetaLine parts={[g.status]} />}
            {item && (
              <Button size="sm" data-tip={item.tip} onClick={item.onSelect}>
                {item.label}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
