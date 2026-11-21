import type { LaidOutNode, LayoutDirection } from '@teamtrail/core';
import { edgePath } from './edgePath';
import type { Rect } from './routeEdge';

const completed = (n: LaidOutNode) => n.ticket.state === 'closed' && n.ticket.closeReason === 'completed';

/**
 * A thin elbow connector between two tickets. Walked ones (the blocker is closed) go faint, the way still to walk is
 * dashed (the critical path a shade stronger), and the one into a card an agent works on now is blaze (`edge-active`).
 * Travelled stretches (both tickets done) keep their class. A pending reroute draws the connectors it would add and
 * remove differently.
 */
export function GraphEdge(props: {
  from: LaidOutNode;
  to: LaidOutNode;
  direction: LayoutDirection;
  /** The cards a long connector keeps clear of. */
  cards: Rect[];
  critical?: boolean;
  added?: boolean;
  removed?: boolean;
}) {
  const { from, to, direction } = props;
  const walked = from.ticket.state !== 'open';
  const classes = ['edge', walked ? 'edge-done' : 'edge-open'];
  if (completed(from) && completed(to)) classes.push('edge-travelled');
  if (walked && (to.state === 'claimed' || to.state === 'verifying')) classes.push('edge-active');
  if (props.critical) classes.push('edge-critical');
  if (props.added) classes.push('edge-added');
  if (props.removed) classes.push('edge-removed');
  return <path className={classes.join(' ')} d={edgePath({ direction, from, to, cards: props.cards })} />;
}
