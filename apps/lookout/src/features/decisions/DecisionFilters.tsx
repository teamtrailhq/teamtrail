import {
  type DecisionFilter,
  type MapSnapshot,
  type DecisionSourceKind,
  DECISION_SOURCE_KINDS,
  DECISION_SOURCES,
  type DecisionStatus,
} from '@teamtrail/core';
import type { ReactNode } from 'react';
import { Select } from '../../components/ui';

/** The filters behind the Logbook's Filter button: one row of selects, then By area (`children`). */
export function DecisionFilters(props: {
  filter: DecisionFilter;
  set: (p: Partial<DecisionFilter>) => void;
  trails: MapSnapshot[];
  people: string[];
  children?: ReactNode;
}) {
  const { filter, set } = props;
  return (
    <div className="dv-filters">
      <Select
        compact
        aria-label="Trail"
        value={filter.mapId ?? ''}
        onChange={(v) => set({ mapId: v || undefined })}
        options={[
          { value: '', label: 'All trails' },
          ...props.trails.map((s) => ({ value: s.map.id, label: `${s.map.key} ${s.map.title}` })),
        ]}
      />
      <Select<DecisionSourceKind | ''>
        compact
        aria-label="Source"
        value={filter.source ?? ''}
        onChange={(v) => set({ source: v || undefined })}
        options={[
          { value: '', label: 'All sources' },
          ...DECISION_SOURCE_KINDS.map((k) => ({ value: k, label: DECISION_SOURCES[k].label })),
        ]}
      />
      <Select<NonNullable<DecisionFilter['madeBy']> | ''>
        compact
        aria-label="Made by"
        value={filter.madeBy ?? ''}
        onChange={(v) => set({ madeBy: v || undefined })}
        options={[
          { value: '', label: 'Made by anyone' },
          { value: 'agent', label: 'Agents, on their own' },
          { value: 'human', label: 'People' },
        ]}
      />
      <Select
        compact
        aria-label="Decided by"
        value={filter.decidedBy ?? ''}
        onChange={(v) => set({ decidedBy: v || undefined })}
        options={[{ value: '', label: 'Decided by anyone' }, ...props.people.map((p) => ({ value: p, label: p }))]}
      />
      <Select<DecisionStatus | ''>
        compact
        aria-label="Status"
        value={filter.status ?? ''}
        onChange={(v) => set({ status: v || undefined })}
        options={[
          { value: '', label: 'Any status' },
          { value: 'active', label: 'Active' },
          { value: 'superseded', label: 'Superseded' },
        ]}
      />
      {props.children}
    </div>
  );
}
