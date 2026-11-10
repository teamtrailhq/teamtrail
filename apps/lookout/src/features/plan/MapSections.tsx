import type { ActivityState, MapSnapshot } from '@teamtrail/core';
import { useState } from 'react';
import { EmptyState, Panel, SectionHeader, Select } from '../../components/ui';
import type { Selection } from '../../lib';
import { PlanTabBody } from './PlanTabBody';
import type { Tab } from './types';

/** Map body sections ("the plan"): a static list per section, picked from a dropdown that carries each count. */
export function MapSections({
  snap,
  selection,
  onSelect,
  bare,
  onAudit,
  activity,
}: {
  snap?: MapSnapshot;
  selection: Selection;
  onSelect: (s: Selection) => void;
  bare?: boolean;
  onAudit?: () => void;
  activity?: ActivityState;
}) {
  const [tab, setTab] = useState<Tab>('unspecified');
  const s = snap?.map.sections;
  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: 'unspecified', label: 'Not yet specified', n: s?.unspecified.length },
    { id: 'assumptions', label: 'Assumptions', n: s?.assumptions?.length },
    { id: 'decisions', label: 'Decisions', n: s?.decisions.length },
    { id: 'oos', label: 'Out of scope', n: s?.outOfScope.length },
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
          info="The parts of the plan that aren't tickets yet: open questions still to specify, the assumptions the plan relies on, decisions already made, what's ruled out, and notes. Report shows how the trail is going: lead times, your interventions, rework, reviews and cost per verified ticket."
        />
      )}
      <div className="sections-tabs">
        <Select
          compact
          aria-label="Plan section"
          value={tab}
          onChange={setTab}
          options={tabs.map((t) => ({ value: t.id, label: t.n === undefined ? t.label : `${t.label} · ${t.n}` }))}
        />
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
