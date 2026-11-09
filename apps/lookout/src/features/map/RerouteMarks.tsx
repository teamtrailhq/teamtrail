import { type DiffMark, NODE_H, NODE_W } from '@teamtrail/core';

/** What a pending reroute does to a card: a strike for cancelled tickets, a word for the rest, ❄ when frozen. */
export function RerouteMarks({ mark, frozen }: { mark?: DiffMark; frozen?: boolean }) {
  const tag = mark && mark !== 'unchanged' && mark !== 'cancelled' ? mark : undefined;
  return (
    <>
      {mark === 'cancelled' && <line className="strike" x1={8} y1={NODE_H / 2} x2={NODE_W - 8} y2={NODE_H / 2} />}
      {tag && (
        <text className="reroute-tag" x={NODE_W - 8} y={NODE_H - 7} textAnchor="end">
          {tag}
        </text>
      )}
      {frozen && (
        <text className="freeze" x={NODE_W - (tag ? 58 : 8)} y={NODE_H - 7} textAnchor="end">
          ❄
        </text>
      )}
    </>
  );
}
