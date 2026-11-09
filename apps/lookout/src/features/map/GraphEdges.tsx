import type { LaidOutNode, LayoutDirection, MapSnapshot, Ticket } from '@teamtrail/core';
import { useMemo } from 'react';
import { cardRects } from './cardRects';
import { criticalEdges } from './criticalEdges';
import { GraphEdge } from './GraphEdge';
import { edgeKey, type MapPreview } from './mapPreview';

/** Every connector on the map, with the critical path and a pending reroute's changes marked. */
export function GraphEdges(props: {
  snap: MapSnapshot;
  tickets: Ticket[];
  direction: LayoutDirection;
  nodes: LaidOutNode[];
  edges: { from: LaidOutNode; to: LaidOutNode }[];
  preview?: MapPreview;
}) {
  const { snap, tickets, direction, preview } = props;
  const critical = useMemo(() => criticalEdges(snap, tickets), [snap, tickets]);
  const cards = useMemo(() => cardRects(props.nodes), [props.nodes]);
  return props.edges.map(({ from, to }) => {
    const key = edgeKey(from.ticket.id, to.ticket.id);
    return (
      <GraphEdge
        key={key}
        from={from}
        to={to}
        direction={direction}
        cards={cards}
        critical={critical.has(key)}
        added={preview?.newEdges.has(key)}
        removed={preview?.removedEdges.has(key)}
      />
    );
  });
}
