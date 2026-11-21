import { StatusMark, type StatusMarkKind } from '../../components/ui';
import { cx } from '../../lib';
import type { TrailSegment } from '../trail-bar';

const WORD: Record<TrailSegment['tone'], string> = {
  done: 'done',
  working: 'at work',
  needs: 'needs you',
  'waiting-agent': 'waits for an agent',
  'not-started': 'waits',
};

const MARK: Record<TrailSegment['tone'], StatusMarkKind> = {
  done: 'verified',
  working: 'now',
  needs: 'held',
  'waiting-agent': 'rework',
  'not-started': 'todo',
};

/** How many tickets the short map shows: the last one done, then what comes next. */
const SHOWN = 7;

/**
 * The map in short: the last ticket done, then the next ones in trail order, each a square with its key, joined by a
 * line, ending at the finish square. The full map is Hands-on's.
 */
export function MapStrip(props: { segments: TrailSegment[]; reached: boolean; onTicket: (id: string) => void }) {
  const lastDone = props.segments.filter((s) => s.tone === 'done').at(-1);
  const ahead = props.segments.filter((s) => s.tone !== 'done');
  const shown = [...(lastDone ? [lastDone] : []), ...ahead].slice(0, SHOWN);
  if (!shown.length) return null;
  return (
    <ol className="home-map-strip" aria-label="The trail in short">
      {shown.map((s) => (
        <li key={s.id} className={cx('map-strip-stop', `tone-${s.tone}`)}>
          <button
            type="button"
            className="map-strip-btn"
            title={`${s.key} ${s.title}: ${WORD[s.tone]}`}
            onClick={() => props.onTicket(s.id)}
          >
            <StatusMark kind={MARK[s.tone]} label={`${s.key} ${WORD[s.tone]}`} />
            <span className="map-strip-key">{s.key}</span>
          </button>
        </li>
      ))}
      <li className={cx('map-strip-stop', 'finish', props.reached && 'reached')}>
        <span className="map-strip-btn">
          <span className="map-strip-finish" aria-hidden="true" />
          <span className="map-strip-key">finish</span>
        </span>
      </li>
    </ol>
  );
}
