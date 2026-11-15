import { type DecisionFilter, filterDecisions, decisionStats, BRAND, decisionsToMarkdown } from '@teamtrail/core';
import { useState, useEffect, useMemo } from 'react';
import { Panel, Label, Button, Empty } from '../../components/ui';
import { type LookoutApi, type Breakpoint } from '../../hooks';
import { download, day } from '../../lib';
import { DecisionDetail } from './DecisionDetail';
import { DecisionFilters } from './DecisionFilters';
import { DecisionList } from './DecisionList';
import { DecisionReadouts } from './DecisionReadouts';
import { DecisionSearch } from './DecisionSearch';
import { useDecisionMemory } from './useDecisionMemory';

/**
 * Decisions audit: every decision across trails, newest first. Covers the
 * zones under the header without moving them; the header stays in place.
 */
export function DecisionsView(props: {
  api: LookoutApi;
  bp: Breakpoint;
  focus?: string;
  onClose: () => void;
  onOpenTicket: (mapId: string, ticketId: string) => void;
}) {
  const { api, bp } = props;
  const all = api.decisions;
  const [filter, setFilter] = useState<DecisionFilter>({});
  const [sel, setSel] = useState<string | undefined>(props.focus);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [byArea, setByArea] = useState(false);
  const memory = useDecisionMemory();
  useEffect(() => setSel(props.focus), [props.focus]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // On a phone, Escape first steps back from a decision to the list.
      if (bp === 'mobile' && sel) setSel(undefined);
      else props.onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [bp, sel, props]);

  const rows = useMemo(() => filterDecisions(all, filter), [all, filter]);
  const stats = useMemo(() => decisionStats(all), [all]);
  const current =
    all.find((d) => d.id === sel && (!filter.mapId || d.mapId === filter.mapId)) ??
    (bp === 'mobile' ? undefined : rows[0]);
  const trails = useMemo(
    () => Object.values(api.allSnaps).sort((a, b) => b.map.createdAt - a.map.createdAt),
    [api.allSnaps],
  );
  const people = useMemo(() => [...new Set(all.map((d) => d.decidedBy))].sort(), [all]);
  const set = (patch: Partial<DecisionFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const exportMd = () => {
    const ms = Object.fromEntries(trails.map((s) => [s.map.id, { key: s.map.key, title: s.map.title }]));
    download(
      `${BRAND.slug}-decisions-${day(Date.now())}.md`,
      decisionsToMarkdown(rows, ms, { title: `${BRAND.name} decisions` }),
    );
  };
  const detailOnly = bp === 'mobile' && !!current;

  return (
    <Panel className={`zone decisions-view dv-${bp}`}>
      <header className="dv-head">
        {detailOnly ? (
          <button className="back" onClick={() => setSel(undefined)}>
            ‹ Decisions
          </button>
        ) : (
          <Label as="h2">
            Decisions {rows.length !== all.length && <span className="n">{`${rows.length}/${all.length}`}</span>}
          </Label>
        )}
        {bp !== 'mobile' && <DecisionReadouts stats={stats} />}
        <span className="dv-head-right">
          {!detailOnly && memory && (
            <Button
              on={byArea}
              aria-pressed={byArea}
              onClick={() => setByArea((v) => !v)}
              title="Group by the area each decision is about, the most cited first"
            >
              By area
            </Button>
          )}
          {!detailOnly && (
            <Button onClick={exportMd} disabled={!rows.length} title="Export the filtered list as markdown">
              Export .md
            </Button>
          )}
          <button className="icon-btn" onClick={props.onClose} aria-label="Close">
            ×
          </button>
        </span>
      </header>

      {!detailOnly && (
        <DecisionSearch
          filter={filter}
          set={set}
          showToggle={bp !== 'wide'}
          filtersOpen={filtersOpen}
          onToggle={() => setFiltersOpen((o) => !o)}
        />
      )}

      <div className="dv-body">
        {(bp === 'wide' || (filtersOpen && !detailOnly)) && (
          <DecisionFilters
            filter={filter}
            set={set}
            all={all}
            trails={trails}
            people={people}
            compact={bp !== 'wide'}
          />
        )}
        {!detailOnly && (
          <DecisionList
            rows={rows}
            current={current}
            snaps={api.allSnaps}
            showTrail={bp === 'wide'}
            onSelect={setSel}
            memory={byArea && memory ? memory : undefined}
          />
        )}
        {(bp !== 'mobile' || current) && (
          <div className="dv-detail">
            {current ? (
              <DecisionDetail
                d={current}
                all={all}
                snap={api.allSnaps[current.mapId]}
                onSelect={setSel}
                onOpenTicket={props.onOpenTicket}
                onSupersede={api.actions.supersede}
              />
            ) : (
              <Empty>No decision selected</Empty>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
