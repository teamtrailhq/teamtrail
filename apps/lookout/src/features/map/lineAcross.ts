import { type LaidOutNode, type LayoutDirection, type LayoutGroup, NODE_H, NODE_W } from '@teamtrail/core';
import { bracketedGroups } from './bracketedGroups';

/**
 * Where `main` or the destination sits across the trail when it joins one card: that card's middle, so the line runs
 * straight. A review beside the trail doesn't count when there is one other card. Undefined when the mark joins
 * several cards or a wrapped layer: it then sits in the middle of the map.
 */
export function lineAcross(input: {
  direction: LayoutDirection;
  nodes: LaidOutNode[];
  groups: LayoutGroup[];
  ends: LaidOutNode[];
}) {
  const { whole, single } = bracketedGroups(input);
  if (whole.length) return undefined;
  const onTrail = single.filter((n) => n.ticket.type !== 'review');
  const card = onTrail.length === 1 ? onTrail[0] : soleCard(single);
  if (!card) return undefined;
  return input.direction === 'LR' ? card.y + NODE_H / 2 : card.x + NODE_W / 2;
}

const soleCard = (cards: LaidOutNode[]) => (cards.length === 1 ? cards[0] : undefined);
