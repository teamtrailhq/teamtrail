import { type LaidOutNode, type ModelTier, NODE_H, NODE_W } from '@teamtrail/core';

/**
 * Model matching on the map: a ready ticket no connected agent is strong enough for says so under its sign, and in
 * the sign's tooltip. Nothing once someone holds it or a session is on it.
 */
export function ModelWaitTag({ n, needs, live }: { n: LaidOutNode; needs?: ModelTier; live: boolean }) {
  const ready = n.state === 'frontier' || n.state === 'rework';
  if (!needs || live || n.ticket.assignee || !ready) return null;
  return (
    <>
      <title>{`Needs a ${needs} model: no connected agent runs one`}</title>
      <text className="live-tag model-wait-tag" x={NODE_W} y={NODE_H + 13} textAnchor="end">
        needs a {needs} model
      </text>
    </>
  );
}
