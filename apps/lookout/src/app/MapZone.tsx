import type { ReactNode } from 'react';
import { Button, EmptyState, Panel } from '../components/ui';
import { MapGraph, type MapPreview } from '../features/map';
import { StatusDrawer } from '../features/status';
import { AgentCommand, CommandBar } from '../features/trail';
import type { LookoutApi } from '../hooks';
import type { Selection } from '../lib';
import { hostedAgents, openHostedAgents } from '../lib/hostedAgents';
import { noTrailHint } from '../lib/noTrailHint';
import { Legend } from './Legend';

export function MapZone(props: {
  api: LookoutApi;
  sessions: LookoutApi['activity']['sessions'];
  onSelect: (s: Selection) => void;
  onNewTrail: () => void;
  compact: boolean;
  minFit: number;
  /** The trail's banners (discovery, reroute) above the map, and a pending reroute's preview drawn on it. */
  trail?: { banner?: ReactNode; preview?: MapPreview };
}) {
  const { snap, selection } = props.api;
  return (
    <Panel as="main" className="zone map-zone" style={{ gridArea: 'map' }}>
      {snap && !hostedAgents() && <CommandBar />}
      {props.trail?.banner}
      <div className="map-area">
        {snap && !props.compact && <StatusDrawer snap={snap} sessions={props.sessions} />}
        {snap ? (
          <MapGraph
            snap={snap}
            sessions={props.sessions}
            leases={props.api.leases}
            selection={selection}
            onSelect={props.onSelect}
            minFit={props.minFit}
            preview={props.trail?.preview}
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
        {snap && props.compact && (
          <Legend planOnly={snap.map.mode === 'plan-only'} verifies={(snap.map.verification ?? 'off') !== 'off'} />
        )}
      </div>
    </Panel>
  );
}
