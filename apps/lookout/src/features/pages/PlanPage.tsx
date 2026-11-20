import type { ActivityState, MapSnapshot } from '@teamtrail/core';
import { type ReactNode, useState } from 'react';
import { LabelLine, Panel, SceneCard } from '../../components/ui';
import type { LookoutApi } from '../../hooks';
import type { Selection } from '../../lib';
import { UnspecifiedDetail } from '../inspector';
import { MapSections } from '../plan';
import type { Tab } from '../plan/types';
import { StatusPanel } from '../status';

/**
 * The plan, a page of its own, read top to bottom: the trail at a glance (the destination as its headline, the phase,
 * what waits on you, the assumptions, the agents and what's next), then the parts that aren't tickets yet on one row
 * of tabs, the open question you picked from them (to make a ticket of it or rule it out), and the status and type
 * mix last.
 */
export function PlanPage(props: {
  api: LookoutApi;
  snap?: MapSnapshot;
  activity: ActivityState;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onAudit: () => void;
  /** The trail at a glance, given a way to open the destination in full. */
  glance: (o: { onDestination: () => void }) => ReactNode;
}) {
  const { snap, selection } = props;
  const [tab, setTab] = useState<Tab>('unspecified');
  const item = selection?.kind === 'unspecified' ? selection.item : undefined;
  return (
    <Panel className="zone page plan-page">
      <div className="plan-flow">
        {snap && props.glance({ onDestination: () => setTab('destination') })}
        <MapSections
          snap={snap}
          selection={selection}
          onSelect={props.onSelect}
          bare
          onAudit={props.onAudit}
          activity={props.activity}
          tab={tab}
          onTab={setTab}
        />
        {snap && item && (
          <SceneCard className="plan-question" label={<LabelLine parts={['Open question']} />}>
            <UnspecifiedDetail snap={snap} item={item} api={props.api} />
          </SceneCard>
        )}
        {snap && (
          <SceneCard className="plan-status">
            <StatusPanel snap={snap} sessions={props.activity.sessions} />
          </SceneCard>
        )}
      </div>
    </Panel>
  );
}
