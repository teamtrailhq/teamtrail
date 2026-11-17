import { cx } from '../../lib';
import type { TrailSegment } from './trailBarModel';

const TONE_WORDS: Record<TrailSegment['tone'], string> = {
  done: 'done',
  working: 'an agent is on it',
  needs: 'needs you',
  'waiting-agent': 'waiting for an agent',
  'not-started': 'not started',
};

/** One segment per ticket, start to end of the trail, in its live tone; a click opens the ticket's bubble. */
export function TrailSegments(props: {
  segments: TrailSegment[];
  selected?: string;
  onSelect: (ticketId: string) => void;
}) {
  return (
    <div className="trail-segments" role="list" aria-label="Tickets on the trail">
      {props.segments.map((s) => (
        <button
          key={s.id}
          type="button"
          role="listitem"
          className={cx('seg', `seg-${s.tone}`, props.selected === s.id && 'on')}
          title={`${s.key} ${s.title} · ${TONE_WORDS[s.tone]}`}
          aria-label={`${s.key} ${s.title}: ${TONE_WORDS[s.tone]}`}
          onClick={() => props.onSelect(s.id)}
        />
      ))}
    </div>
  );
}
