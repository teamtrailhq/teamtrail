import type { ActivityState, MapSnapshot } from '@teamtrail/core';
import type { ReactNode } from 'react';
import { Panel, SectionHeader } from '../../components/ui';
import type { LookoutApi } from '../../hooks';
import type { Selection } from '../../lib';
import { UnspecifiedDetail } from '../inspector';
import { MapSections } from '../plan';
import { StatusPanel } from '../status';

/**
 * The plan, a page of its own: the parts that aren't tickets yet (open questions, assumptions, decisions, what's ruled
 * out, notes, the report) beside the trail at a glance and its status and type mix, or the open question you picked, to make a ticket
 * of it or rule it out.
 */
export function PlanPage(props: {
  api: LookoutApi;
  snap?: MapSnapshot;
  activity: ActivityState;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onAudit: () => void;
  /** The trail at a glance: its phase, checks on main, what waits on you, the agents and what's ready next. */
  glance: ReactNode;
}) {
  const { snap, selection } = props;
  const item = selection?.kind === 'unspecified' ? selection.item : undefined;
  return (
    <Panel className="zone page plan-page">
      <section className="page-col">
        <MapSections
          snap={snap}
          selection={selection}
          onSelect={props.onSelect}
          bare
          onAudit={props.onAudit}
          activity={props.activity}
        />
      </section>
      <section className="page-col">
        {item && <SectionHeader title="Open question" />}
        <div className="zone-b">
          {snap && item && <UnspecifiedDetail snap={snap} item={item} api={props.api} />}
          {snap && !item && (
            <>
              {props.glance}
              <StatusPanel snap={snap} sessions={props.activity.sessions} />
            </>
          )}
        </div>
      </section>
    </Panel>
  );
}
