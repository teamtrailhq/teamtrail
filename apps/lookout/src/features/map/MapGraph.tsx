import { leaseHealth, NODE_H, NODE_W } from '@teamtrail/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNow, usePrSync } from '../../hooks';
import { heldLeases, prSync, worstFlag } from '../../lib';
import { bubbleRoom } from './bubbleRoom';
import { GraphDefs } from './GraphDefs';
import { GraphEdges } from './GraphEdges';
import { GraphNode } from './GraphNode';
import { MainMark } from './MainMark';
import { MAIN_H, MAIN_W, mainSpot } from './mainSpot';
import { MapDestination } from './MapDestination';
import { openingView } from './openingView';
import { OutOfScopeStrip } from './OutOfScopeStrip';
import { prChip } from './prChip';
import { TerrainLayer } from './TerrainLayer';
import type { AnchorOf, MapGraphProps } from './types';
import { useCardHolds } from './useCardHolds';
import { useFocusSelected } from './useFocusSelected';
import { useMapGestures } from './useMapGestures';
import { PAD, useMapLayout } from './useMapLayout';
import { useWheelZoom } from './useWheelZoom';
import { type View, zoomAt } from './zoomAt';

/** Decision graph. Fits itself to the zone; drag/pinch/wheel to pan and zoom. What's selected gets the overlay. */
export function MapGraph(props: MapGraphProps) {
  const { snap, selection, onSelect, preview } = props;
  const proofs = props.proofs ?? {};
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

  const { L, destination, room, W, H, fitK } = useMapLayout({
    tickets,
    mode: snap.map.mode,
    size,
    minFit: props.minFit,
    main: !!props.main,
  });
  const main = useMemo(
    () =>
      props.main
        ? mainSpot({ direction: L.direction, nodes: L.nodes, groups: L.groups, graphH: L.graphH, width: L.width })
        : null,
    [props.main, L],
  );
  /** The cards where they are drawn, `main`'s room included: for the terrain, the opening view and the focus. */
  const shifted = useMemo(() => L.nodes.map((n) => ({ ...n, x: n.x + room.x, y: n.y + room.y })), [L.nodes, room]);
  const origin = { x: PAD + room.x, y: PAD + room.y };

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
    if (!touched.current && size.w)
      setView(
        openingView({ fit: fitView(), nodes: shifted, size, pad: PAD, focus: props.focus, room: bubbleRoom(size.w) }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, W, H, snap.map.id, props.focus?.[0]]);

  const gestures = useMapGestures({ box, view, setView, onTouch: () => (touched.current = true) });
  useWheelZoom(box, (factor, at) => {
    touched.current = true;
    setView((v) => zoomAt(v, v.k * factor, at));
  });

  const now = useNow(5000);
  const held = heldLeases(props.leases, snap.map.id);
  const sync = usePrSync();
  const holds = useCardHolds(snap);
  const selId = selection?.kind === 'ticket' ? selection.id : undefined;
  useFocusSelected({
    ...{ selId, nodes: shifted, size, pad: PAD, view, setView },
    room: bubbleRoom(size.w),
    onFocus: () => (touched.current = true),
  });

  const anchorOf: AnchorOf = (id) => {
    const rect =
      id === 'main' ? main && { x: main.x, y: main.y, w: MAIN_W, h: MAIN_H } : (spotRect(id) ?? nodeRect(id));
    if (!rect) return undefined;
    const left = view.x + (origin.x + rect.x) * view.k;
    const top = view.y + (origin.y + rect.y) * view.k;
    return { left, top, right: left + rect.w * view.k, bottom: top + rect.h * view.k };
  };
  // the destination mark is drawn around its spot
  const spotRect = (id: string) =>
    id === 'destination' ? { x: destination.x - 24, y: destination.y - 24, w: 48, h: 48 } : undefined;
  const nodeRect = (id: string) => {
    const n = L.nodes.find((x) => x.ticket.id === id);
    return n && { x: n.x, y: n.y, w: NODE_W, h: NODE_H };
  };

  return (
    <>
      <div className="graph-box" ref={box} {...gestures}>
        <svg className="graph" width={size.w} height={size.h} onClick={() => onSelect(null)}>
          <GraphDefs />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <g transform={`translate(${PAD} ${PAD})`}>
              <TerrainLayer seed={snap.map.id} width={W} height={H} nodes={shifted} />
            </g>
            <g transform={`translate(${origin.x} ${origin.y})`}>
              <OutOfScopeStrip y={L.quarantineY} width={L.width} height={L.quarantineH} nodes={L.nodes} />
              <GraphEdges
                snap={snap}
                tickets={tickets}
                direction={L.direction}
                nodes={L.nodes}
                edges={L.edges}
                preview={preview}
              />
              <MapDestination
                laid={L}
                spot={destination}
                text={snap.map.sections.destination}
                done={props.done}
                selected={selection?.kind === 'together'}
                onSelect={() => onSelect({ kind: 'together' })}
              />
              {main && props.main && (
                <MainMark
                  {...main}
                  tone={props.main}
                  selected={selection?.kind === 'main'}
                  onSelect={() => onSelect({ kind: 'main' })}
                />
              )}
              {L.nodes.map((n) => {
                const lease = held.get(n.ticket.id);
                return (
                  <GraphNode
                    key={n.ticket.id}
                    n={n}
                    live={props.live.get(n.ticket.id)}
                    now={now}
                    stalled={!!lease && leaseHealth(lease, now) !== 'live'}
                    flag={worstFlag(prSync.ticket(sync, snap.map.id, n.ticket.id))}
                    pr={prChip(prSync.ticket(sync, snap.map.id, n.ticket.id))}
                    selected={selId === n.ticket.id}
                    onSelect={onSelect}
                    mark={preview?.marks.get(n.ticket.id)}
                    frozen={preview?.frozen.has(n.ticket.id)}
                    {...holds(n.ticket)}
                    verified={proofs[n.ticket.id] === undefined ? undefined : proofs[n.ticket.id] === 'verified'}
                  />
                );
              })}
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
      {props.overlay?.(anchorOf, size)}
    </>
  );
}
