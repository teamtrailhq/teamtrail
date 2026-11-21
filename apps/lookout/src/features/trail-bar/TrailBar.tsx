import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Button, LabelLine, Panel } from '../../components/ui';
import { cx } from '../../lib';
import { countWords, type TrailCounts, type TrailSegment } from './trailBarModel';
import { TrailDrawer, type TrailTab } from './TrailDrawer';
import { TrailSegments } from './TrailSegments';
import { useDismiss } from './useDismiss';

/**
 * Under the map, the whole trail in one line: its label, a segment per ticket and the counts in words, what needs you
 * as the one rose chip (it opens Needs you), and More. More opens the three lists as tabs in a drawer over the map
 * (TrailDrawer), a bottom sheet on a phone: a popover, closed on every load (`more` is the app's state, never stored).
 */
export function TrailBar(props: {
  trailKey?: string;
  segments: TrailSegment[];
  counts: TrailCounts;
  selected?: string;
  more: boolean;
  onMore: (more: boolean) => void;
  onTicket: (ticketId: string) => void;
  /** How many rows each list holds, for its tab. */
  listCounts: Record<TrailTab, number>;
  lists: Record<TrailTab, ReactNode>;
}) {
  const { onMore } = props;
  const [tab, setTab] = useState<TrailTab>('needs');
  const close = useCallback(() => onMore(false), [onMore]);
  const zone = useRef<HTMLDivElement>(null);
  useDismiss({ open: props.more, box: zone, onClose: close });
  const open = (to: TrailTab) => {
    setTab(to);
    onMore(true);
  };
  return (
    <div ref={zone} className={cx('trail-bar-zone', props.more && 'extended')}>
      {props.more && (
        <TrailDrawer tab={tab} onTab={setTab} counts={props.listCounts} lists={props.lists} onClose={close} />
      )}
      <Panel className="trail-bar">
        <LabelLine parts={['Trail', props.trailKey]} />
        <TrailSegments segments={props.segments} selected={props.selected} onSelect={props.onTicket} />
        <span className="trail-counts">
          {countWords(props.counts).map((p, i) => (
            <span key={p.text} className={cx(i === 0 && 'strong')}>
              {i > 0 && <span className="sep"> · </span>}
              {p.urgent ? (
                <button type="button" className="need-count" onClick={() => open('needs')}>
                  {p.text}
                </button>
              ) : (
                p.text
              )}
            </span>
          ))}
        </span>
        <Button size="sm" variant="ghost" aria-expanded={props.more} onClick={() => onMore(!props.more)}>
          {props.more ? 'Less' : 'More'}
        </Button>
      </Panel>
    </div>
  );
}
