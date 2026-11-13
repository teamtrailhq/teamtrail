import type { ReactNode } from 'react';
import { Button, EmptyState, Panel } from '../components/ui';
import { MapGraph, type MapPreview } from '../features/map';
import { StatusDrawer } from '../features/status';
import { AgentCommand, CommandBar } from '../features/trail';
import type { LookoutApi } from '../hooks';
import type { Selection } from '../lib';
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
      {snap && <CommandBar />}
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
            <EmptyState
              title="No trail yet"
              hint="Describe your idea here, or start it in Claude Code or Codex. Scout frames it with you, then your agents get to work."
            />
            <div className="actions">
              <Button variant="primary" onClick={props.onNewTrail} data-tip="Describe the idea and create the trail">
                New trail…
              </Button>
            </div>
            <AgentCommand command='/scout new "your idea"' />
          </div>
        )}
        {snap && props.compact && (
          <Legend planOnly={snap.map.mode === 'plan-only'} verifies={(snap.map.verification ?? 'off') !== 'off'} />
        )}
      </div>
    </Panel>
  );
}
