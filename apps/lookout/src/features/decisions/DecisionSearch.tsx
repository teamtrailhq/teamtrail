import type { DecisionFilter } from '@teamtrail/core';
import { Button } from '../../components/ui';

/** The search box, then one Filter button (with how many filters are set), which opens the filters and By area. */
export function DecisionSearch(props: {
  filter: DecisionFilter;
  set: (patch: Partial<DecisionFilter>) => void;
  filtersOpen: boolean;
  /** By area counts as a filter set while it's on. */
  byArea: boolean;
  onToggle: () => void;
}) {
  const { filter } = props;
  const active = Object.values(filter).filter(Boolean).length;
  /** Filters set besides the search box. */
  const extra = active - (filter.query ? 1 : 0) + (props.byArea ? 1 : 0);
  return (
    <div className="dv-search">
      <input
        type="search"
        placeholder="Search decisions"
        value={filter.query ?? ''}
        onChange={(e) => props.set({ query: e.target.value })}
      />
      <Button on={props.filtersOpen || extra > 0} aria-expanded={props.filtersOpen} onClick={props.onToggle}>
        Filter{extra > 0 ? ` · ${extra}` : ''}
      </Button>
    </div>
  );
}
