import type { GapAction, GapOwner, GapStanding } from '@teamtrail/core';
import { Button, LabelLine, type MenuItem, MetaLine } from '../../components/ui';
import type { LabelPart } from '../../lib/labelParts';

/** Who a gap waits on, as its owner tag: rose only when it's yours to close now. */
const OWNER: Record<GapOwner, LabelPart> = {
  you: { text: 'you', tone: 'urgent' },
  agent: { text: 'agent', tone: 'agent' },
  main: { text: 'main', tone: 'dim' },
  accepted: { text: 'accepted', tone: 'ok' },
  nobody: { text: 'nobody', tone: 'dim' },
};

/**
 * Why a proof isn't verified, one gap a line: what's missing, then its owner tag (you, agent, main, accepted, nobody)
 * and who is on it in words, with the one action that closes it when it's the human's, unless that action is the
 * ticket's primary (`primary`): then the footer says it, once. Without a plan (an older server) the gaps' lines alone.
 */
export function ProofGapList(props: {
  gaps: string[];
  plan?: GapStanding[];
  actions?: Map<GapAction, MenuItem>;
  primary?: MenuItem;
}) {
  const plan: (Partial<GapStanding> & { text: string })[] = props.plan ?? props.gaps.map((text) => ({ text }));
  if (!plan.length) return null;
  return (
    <div className="proof-gaps-block">
      <LabelLine parts={['Not verified because']} />
      <ul className="proof-gaps proof-gap-list">
        {plan.map((g) => {
          const action = g.action && props.actions?.get(g.action);
          const item = action && !sameAction(action, props.primary) ? action : undefined;
          return (
            <li key={g.text} className="proof-gap">
              <span className="t-body">{g.text}</span>
              {g.status && (
                <span className="proof-gap-who">
                  {g.owner && <LabelLine parts={[OWNER[g.owner]]} className="proof-gap-owner" />}
                  <MetaLine parts={[g.status]} />
                </span>
              )}
              {item && (
                <Button size="sm" data-tip={item.tip} onClick={item.onSelect}>
                  {item.label}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The same action as the footer's primary: the same item, its id or its words. */
function sameAction(item: MenuItem, primary?: MenuItem) {
  return !!primary && (item === primary || item.id === primary.id || item.label === primary.label);
}
