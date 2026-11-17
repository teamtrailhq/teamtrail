import type { TrailDone } from '@teamtrail/core';
import type { ReactNode } from 'react';
import { Button, EmptyState, Panel } from '../components/ui';
import {
  type AnchorOf,
  type MainTone,
  MapGraph,
  MapLegend,
  type MapPreview,
  type ProofStatuses,
} from '../features/map';
import { AgentCommand, CommandBar } from '../features/trail';
import type { LookoutApi } from '../hooks';
import type { Selection } from '../lib';
import { hostedAgents, openHostedAgents } from '../lib/hostedAgents';
import type { LiveTicket } from '../lib/liveTickets';
import { noTrailHint } from '../lib/noTrailHint';

/**
 * The map, filling the page between the header and the trail bar: the trail's banners over it, the graph with its
 * live cards and `main`, the legend in its corner, and the bubble on what's selected: inside the map beside it, or on
 * a phone (`docked`), as a sheet under the map.
 */
export function MapZone(props: {
  api: LookoutApi;
  live: Map<string, LiveTicket>;
  main?: MainTone;
  onSelect: (s: Selection) => void;
  onNewTrail: () => void;
  minFit: number;
  docked: boolean;
  /** The bubble for what's selected, placed by the map (`anchorOf`) or docked under it. */
  bubble: (place?: { anchorOf: AnchorOf; box: { w: number; h: number } }) => ReactNode;
  /**
   * The trail's banners (discovery, reroute) above the map, a pending reroute's preview drawn on it, its tickets'
   * proofs and whether it's done.
   */
  trail?: { banner?: ReactNode; preview?: MapPreview; proofs?: ProofStatuses; done?: TrailDone };
}) {
  const { snap, selection } = props.api;
  return (
    <Panel as="main" className="zone map-zone" style={{ gridArea: 'map' }}>
      {snap && !hostedAgents() && <CommandBar />}
      {props.trail?.banner}
      <div className="map-area">
        {snap ? (
          <MapGraph
            snap={snap}
            live={props.live}
            leases={props.api.leases}
            selection={selection}
            onSelect={props.onSelect}
            minFit={props.minFit}
            preview={props.trail?.preview}
            proofs={props.trail?.proofs}
            done={props.trail?.done}
            main={props.main}
            overlay={props.docked ? undefined : (anchorOf, box) => props.bubble({ anchorOf, box })}
          />
        ) : (
          <div className="nomap">
            <EmptyState title="No trail yet" hint={noTrailHint()} />
            <div className="actions">
              <Button variant="primary" onClick={props.onNewTrail} data-tip="Describe the idea and create the trail">
                New trail…
              </Button>
            </div>
            {hostedAgents() ? (
              <Button onClick={openHostedAgents}>{hostedAgents()?.label}</Button>
            ) : (
              <AgentCommand command='/scout new "your idea"' />
            )}
          </div>
        )}
        {!snap && !props.docked && props.bubble({ anchorOf: () => undefined, box: { w: 0, h: 0 } })}
        {snap && <MapLegend />}
      </div>
      {props.docked && props.bubble()}
    </Panel>
  );
}
