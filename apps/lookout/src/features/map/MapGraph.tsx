import { type MapSnapshot, type SessionInfo, type TicketLease, layout, leaseHealth } from '@teamtrail/core';
import { useRef, useState, useEffect, useMemo } from 'react';
import { useNow, usePrSync } from '../../hooks';
import { type Selection, heldLeases, isRunning, prSync, worstFlag } from '../../lib';
import { useModels } from '../models';
import { destinationSpot, destinationTrail } from './destination';
import { DestinationMark } from './DestinationMark';
import { DestinationTrail } from './DestinationTrail';
import { GraphDefs } from './GraphDefs';
import { GraphEdge } from './GraphEdge';
import { GraphNode } from './GraphNode';
import { edgeKey, type MapPreview } from './mapPreview';
import { openingView } from './openingView';
import { OutOfScopeStrip } from './OutOfScopeStrip';
import { TerrainLayer } from './TerrainLayer';
import { useFocusSelected } from './useFocusSelected';
import { useWheelZoom } from './useWheelZoom';
import { type View, zoomAt } from './zoomAt';

export const PAD = 32;
const LR_PREFERENCE = 1.8;

/** Decision graph. Fits itself to the zone; drag/pinch/wheel to pan and zoom. */
export function MapGraph(props: {
  snap: MapSnapshot;
  sessions: SessionInfo[];
  leases?: TicketLease[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  /** Smallest zoom the initial fit may use; keeps text readable on phones. */
  minFit?: number;
  /** A pending reroute drawn over the map: ghost, struck and frozen tickets, dashed new edges. */
  preview?: MapPreview;
}) {
  const { snap, selection, onSelect, preview } = props;
  const tickets = preview?.tickets ?? snap.tickets;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const base = useMemo(() => {
    const lr = layout(tickets, 'LR', snap.map.mode);
    const tb = layout(tickets, 'TB', snap.map.mode);
    const fit = (l: typeof lr) => Math.min(size.w / (l.width + PAD * 2), size.h / (l.height + PAD * 2 + 16));
    // A trail reads best left to right, so it only turns vertical when that fits much better.
    return fit(lr) * LR_PREFERENCE >= fit(tb) ? lr : tb;
  }, [tickets, snap.map.mode, size.w, size.h]);
  const fitK = (w: number, h: number) => Math.min(1.25, Math.max(props.minFit ?? 0, Math.min(size.w / w, size.h / h)));

  // Out-of-scope strip sits on the bottom edge of the zone: the spare height at fit goes between the graph and it.
  const L = useMemo(() => {
    const W0 = base.width + PAD * 2;
    const H0 = base.height + PAD * 2 + 16;
    const hasOos = base.nodes.some((n) => n.state === 'out-of-scope');
    const slack = hasOos && size.h ? Math.max(0, size.h / fitK(W0, H0) - H0) : 0;
    if (!slack) return { ...base, slack };
    const moved = new Map(
      base.nodes.map((n) => [n, { ...n, y: n.y + (n.state === 'out-of-scope' ? slack : slack / 2) }]),
    );
    return {
      ...base,
      slack,
      nodes: [...moved.values()],
      edges: base.edges.map((e) => ({ from: moved.get(e.from)!, to: moved.get(e.to)! })),
      quarantineY: base.quarantineY + slack,
      height: base.height + slack,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, size.w, size.h, props.minFit]);
  const destination = destinationSpot(L);
  const W = destination.right + PAD * 2;
  const H = destination.bottom + PAD * 2 + 16;

  const fitView = (): View => {
    const k = fitK(W, H);
    return { k, x: Math.max(0, (size.w - W * k) / 2), y: Math.max(0, (size.h - H * k) / 2) };
  };
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const touched = useRef(false);
  useEffect(() => {
    touched.current = false;
  }, [snap.map.id]);
  useEffect(() => {
    if (!touched.current && size.w) setView(openingView({ fit: fitView(), nodes: L.nodes, size, pad: PAD }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, W, H, snap.map.id]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ view: View; dist: number; mid: { x: number; y: number }; moved: boolean } | null>(null);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const startGesture = () => {
    const pts = [...pointers.current.values()];
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { view, dist, mid, moved: gesture.current?.moved ?? false };
  };

  useWheelZoom(box, (factor, at) => {
    touched.current = true;
    setView((v) => zoomAt(v, v.k * factor, at));
  });

  const now = useNow(5000);
  const held = heldLeases(props.leases, snap.map.id);
  const sync = usePrSync();
  const waits = useModels()?.waiting;
  const live = new Map(props.sessions.filter((s) => isRunning(s) && s.ticketId).map((s) => [s.ticketId!, s]));
  const selId = selection?.kind === 'ticket' ? selection.id : undefined;
  useFocusSelected({ selId, nodes: L.nodes, size, pad: PAD, view, setView, onFocus: () => (touched.current = true) });

  return (
    <div
      className="graph-box"
      ref={box}
      onPointerDown={(e) => {
        pointers.current.set(e.pointerId, local(e));
        if (pointers.current.size === 1) gesture.current = null;
        startGesture();
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId) || !gesture.current) return;
        pointers.current.set(e.pointerId, local(e));
        const g = gesture.current;
        const pts = [...pointers.current.values()];
        if (pts.length > 1) {
          const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          const z = zoomAt(g.view, (g.view.k * dist) / (g.dist || dist), g.mid);
          setView({ ...z, x: z.x + mid.x - g.mid.x, y: z.y + mid.y - g.mid.y });
          g.moved = true;
        } else {
          const dx = pts[0].x - g.mid.x,
            dy = pts[0].y - g.mid.y;
          if (!g.moved && Math.hypot(dx, dy) < 5) return;
          if (!g.moved) box.current?.setPointerCapture(e.pointerId);
          g.moved = true;
          setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
        }
        touched.current = true;
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size) startGesture();
      }}
      onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      onClickCapture={(e) => {
        if (gesture.current?.moved) {
          e.stopPropagation();
          gesture.current = null;
        }
      }}
    >
      <svg className="graph" width={size.w} height={size.h} onClick={() => onSelect(null)}>
        <GraphDefs />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g transform={`translate(${PAD} ${PAD})`}>
            <TerrainLayer seed={snap.map.id} width={W} height={H} nodes={L.nodes} />
            {L.nodes.some((n) => n.state === 'out-of-scope') && (
              <OutOfScopeStrip y={L.quarantineY} width={L.width} height={L.quarantineH} />
            )}

            {L.edges.map(({ from, to }) => (
              <GraphEdge
                key={`${from.ticket.id}-${to.ticket.id}`}
                from={from}
                to={to}
                direction={L.direction}
                added={preview?.newEdges.has(edgeKey(from.ticket.id, to.ticket.id))}
                removed={preview?.removedEdges.has(edgeKey(from.ticket.id, to.ticket.id))}
              />
            ))}

            <DestinationTrail trails={destinationTrail(L, destination)} />
            {L.nodes.length > 0 && <DestinationMark x={destination.x} y={destination.y} />}

            {L.nodes.map((n) => (
              <GraphNode
                key={n.ticket.id}
                n={n}
                session={live.get(n.ticket.id)}
                stalled={!!held.get(n.ticket.id) && leaseHealth(held.get(n.ticket.id)!, now) !== 'live'}
                flag={worstFlag(prSync.ticket(sync, snap.map.id, n.ticket.id))}
                selected={selId === n.ticket.id}
                onSelect={onSelect}
                mark={preview?.marks.get(n.ticket.id)}
                frozen={preview?.frozen.has(n.ticket.id)}
                needs={waits?.find((w) => w.mapId === snap.map.id && w.ticketId === n.ticket.id)?.tier}
              />
            ))}
          </g>
        </g>
      </svg>
      <button
        className="btn sm fit-btn"
        data-tip="Fit the whole trail in view"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          touched.current = true;
          setView(fitView());
        }}
      >
        Fit
      </button>
    </div>
  );
}
