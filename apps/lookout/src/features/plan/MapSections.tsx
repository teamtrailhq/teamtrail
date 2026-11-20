import type { ActivityState, MapSnapshot } from '@teamtrail/core';
import { useState } from 'react';
import { EmptyState, Panel, SectionHeader, Tabs } from '../../components/ui';
import type { Selection } from '../../lib';
import { PlanTabBody } from './PlanTabBody';
import type { Tab } from './types';

/**
 * Map body sections ("the plan"): the parts that aren't tickets yet, on one row of tabs that carry their counts, the
 * open one's list under it. `tab` and `onTab` let the page open a section (the destination in full) from elsewhere.
 */
export function MapSections({
  snap,
  selection,
  onSelect,
  bare,
  onAudit,
  activity,
  tab: shown,
  onTab,
}: {
  snap?: MapSnapshot;
  selection: Selection;
  onSelect: (s: Selection) => void;
  bare?: boolean;
  onAudit?: () => void;
  activity?: ActivityState;
  tab?: Tab;
  onTab?: (tab: Tab) => void;
}) {
  const [own, setOwn] = useState<Tab>('unspecified');
  const tab = shown ?? own;
  const setTab = onTab ?? setOwn;
  const s = snap?.map.sections;
  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: 'unspecified', label: 'Not yet specified', n: s?.unspecified.length },
    { id: 'decisions', label: 'Decisions', n: s?.decisions.length },
    { id: 'oos', label: 'Out of scope', n: s?.outOfScope.length },
    { id: 'destination', label: 'Destination' },
    { id: 'notes', label: 'Notes' },
    { id: 'report', label: 'Report' },
  ];
  const body = snap ? (
    <PlanTabBody tab={tab} snap={snap} selection={selection} onSelect={onSelect} activity={activity} />
  ) : (
    <EmptyState
      title="No plan yet"
      hint="Open questions, decisions, what's ruled out, notes and the trail report collect here."
    />
  );
  return (
    <Panel className={`zone sections ${bare ? 'bare' : ''}`} style={bare ? undefined : { gridArea: 'plan' }}>
      {!bare && (
        <SectionHeader
          className="zone-title"
          icon="flag"
          title="Trail plan"
          info="The parts of the plan that aren't tickets yet: open questions still to specify, decisions already made, what's ruled out, the destination in full, and notes. Report shows how the trail is going: lead times, your interventions, rework, reviews and cost per verified ticket."
        />
      )}
      <div className="sections-tabs">
        <Tabs className="plan-tabs" value={tab} onChange={setTab} items={tabs} />
        {tab === 'decisions' && onAudit && (
          <button className="link" onClick={onAudit}>
            Audit ›
          </button>
        )}
      </div>
      <div className="zone-b">{body}</div>
    </Panel>
  );
}
