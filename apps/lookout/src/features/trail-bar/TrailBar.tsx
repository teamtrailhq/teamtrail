import type { AttentionItem } from '@teamtrail/core';
import type { ReactNode } from 'react';
import { Button, Panel } from '../../components/ui';
import { cx } from '../../lib';
import { NeedChips } from './NeedChips';
import { countWords, type TrailCounts, type TrailSegment } from './trailBarModel';
import { TrailSegments } from './TrailSegments';

/**
 * Under the map, the whole trail in one line: a segment per ticket, the counts in words, a chip for each thing that
 * needs you, and More. Extended (More), the same bar over three lists side by side (`lists`).
 */
export function TrailBar(props: {
  segments: TrailSegment[];
  counts: TrailCounts;
  needs: AttentionItem[];
  keyOf: (ticketId: string) => string | undefined;
  selected?: string;
  more: boolean;
  /** No More/Less: the lists always show (phone). */
  fixed?: boolean;
  /** How many chips of what needs you fit. */
  chips: number;
  onMore: (more: boolean) => void;
  onTicket: (ticketId: string) => void;
  onNeed: (item: AttentionItem) => void;
  lists: ReactNode;
}) {
  const extended = props.more || props.fixed;
  return (
    <div className={cx('trail-bar-zone', extended && 'extended')}>
      <Panel className="trail-bar">
        <span className="t-label">Trail</span>
        <TrailSegments segments={props.segments} selected={props.selected} onSelect={props.onTicket} />
        <span className="trail-counts">
          {countWords(props.counts).map((p, i) => (
            <span key={p.text} className={cx(i === 0 && 'strong', p.urgent && 'urgent')}>
              {i > 0 && <span className="sep"> · </span>}
              {p.text}
            </span>
          ))}
        </span>
        {!extended && (
          <NeedChips
            items={props.needs}
            keyOf={props.keyOf}
            onOpen={props.onNeed}
            onMore={() => props.onMore(true)}
            max={props.chips}
          />
        )}
        {!props.fixed && (
          <Button size="sm" aria-expanded={props.more} onClick={() => props.onMore(!props.more)}>
            {props.more ? 'Less' : 'More'}
          </Button>
        )}
      </Panel>
      {extended && <div className="trail-lists">{props.lists}</div>}
    </div>
  );
}
