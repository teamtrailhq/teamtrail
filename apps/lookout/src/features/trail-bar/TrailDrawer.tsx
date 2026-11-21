import type { ReactNode } from 'react';
import { cx } from '../../lib';

export type TrailTab = 'needs' | 'agents' | 'next';

const TABS: { id: TrailTab; label: string }[] = [
  { id: 'needs', label: 'Needs you' },
  { id: 'agents', label: 'Agents' },
  { id: 'next', label: 'Up next' },
];

/**
 * More, opened: a drawer over the map with the trail's three lists as tabs, Needs you · Agents · Up next, each with
 * its count. A bottom sheet on a phone (styles). A popover: ×, Esc, a press outside it or the bar (TrailBar's
 * useDismiss) and opening something from it close it, and it is never restored on load.
 */
export function TrailDrawer(props: {
  tab: TrailTab;
  onTab: (tab: TrailTab) => void;
  counts: Record<TrailTab, number>;
  lists: Record<TrailTab, ReactNode>;
  onClose: () => void;
}) {
  return (
    <div className="trail-lists trail-drawer ds-arrive">
      <div className="trail-tabs" role="tablist" aria-label="The trail's lists">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`trail-tab-${t.id}`}
            aria-selected={props.tab === t.id}
            aria-controls="trail-tab-panel"
            className={cx(
              'trail-tab',
              props.tab === t.id && 'on',
              t.id === 'needs' && props.counts.needs > 0 && 'urgent',
            )}
            onClick={() => props.onTab(t.id)}
          >
            {t.label} <span className="n">{props.counts[t.id]}</span>
          </button>
        ))}
        <button type="button" className="trail-drawer-close" aria-label="Close the lists" onClick={props.onClose}>
          ×
        </button>
      </div>
      <div className="trail-tab-panel" id="trail-tab-panel" role="tabpanel" aria-labelledby={`trail-tab-${props.tab}`}>
        {props.lists[props.tab]}
      </div>
    </div>
  );
}
