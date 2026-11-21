import { type DecisionFilter, filterDecisions, decisionStats, BRAND, decisionsToMarkdown } from '@teamtrail/core';
import { useState, useEffect, useMemo } from 'react';
import { Panel, Label, Button, Empty } from '../../components/ui';
import { type LookoutApi, type Breakpoint } from '../../hooks';
import { download, day } from '../../lib';
import { isKept, markKept } from '../../lib/keptDecisions';
import { AgentReview } from './AgentReview';
import { DecisionDetail } from './DecisionDetail';
import { DecisionFilters } from './DecisionFilters';
import { DecisionList } from './DecisionList';
import { DecisionReadouts } from './DecisionReadouts';
import { DecisionSearch } from './DecisionSearch';
import { keptKey } from './keptKey';
import { splitForReview } from './reviewQueue';
import { useDecisionMemory } from './useDecisionMemory';

/**
 * The Logbook: every decision across trails as a ledger, newest first, led by the calls agents made themselves for
 * you to keep or overrule. Covers the zones under the header without moving them; the header stays in place.
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
  /** Set on Keep, so the page renders again and reads this browser's kept list afresh. */
  const [, setKeptAt] = useState(0);
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
  const split = splitForReview(rows, isKept);
  const keep = (d: (typeof rows)[number]) => {
    markKept(keptKey(d));
    setKeptAt(Date.now());
  };
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
            ‹ Logbook
          </button>
        ) : (
          <Label as="h2">
            Logbook {rows.length !== all.length && <span className="n">{`${rows.length}/${all.length}`}</span>}
          </Label>
        )}
        {bp !== 'mobile' && !detailOnly && <DecisionReadouts stats={stats} />}
        <span className="dv-head-right">
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
          filtersOpen={filtersOpen}
          byArea={byArea}
          onToggle={() => setFiltersOpen((o) => !o)}
        />
      )}
      {filtersOpen && !detailOnly && (
        <DecisionFilters filter={filter} set={set} trails={trails} people={people}>
          {memory && (
            <Button
              on={byArea}
              aria-pressed={byArea}
              onClick={() => setByArea((v) => !v)}
              title="Group by the area each decision is about, the most cited first"
            >
              By area
            </Button>
          )}
        </DecisionFilters>
      )}

      <div className="dv-body">
        {!detailOnly && (
          <div className="dv-scroll">
            <AgentReview
              rows={split.review}
              current={current}
              snaps={api.allSnaps}
              showTrail={bp === 'wide'}
              onSelect={setSel}
              onKeep={keep}
              onSupersede={api.actions.supersede}
            />
            <DecisionList
              rows={split.ledger}
              current={current}
              snaps={api.allSnaps}
              showTrail={bp === 'wide'}
              onSelect={setSel}
              kept={isKept}
              titled={split.review.length > 0}
              memory={byArea && memory ? memory : undefined}
            />
          </div>
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
