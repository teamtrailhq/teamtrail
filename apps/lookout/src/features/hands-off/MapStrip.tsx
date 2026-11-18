import { Pill } from '../../components/ui';
import { cx } from '../../lib';
import type { TrailSegment } from '../trail-bar';

const WORD: Record<TrailSegment['tone'], string> = {
  done: 'done',
  working: 'at work',
  needs: 'needs you',
  'waiting-agent': 'waits for an agent',
  'not-started': 'waits',
};

/** How many tickets the short map shows: the last one done, then what comes next. */
const SHOWN = 6;

/** The map in short: the last ticket done, then the next ones in trail order, each with where it is; the full map is Hands-on's. */
export function MapStrip(props: { segments: TrailSegment[]; onTicket: (id: string) => void; onFullMap: () => void }) {
  const lastDone = props.segments.filter((s) => s.tone === 'done').at(-1);
  const ahead = props.segments.filter((s) => s.tone !== 'done');
  const shown = [...(lastDone ? [lastDone] : []), ...ahead].slice(0, SHOWN);
  return (
    <div className="home-map-strip">
      <ol>
        {shown.map((s) => (
          <li key={s.id}>
            <button type="button" className="link" title={s.title} onClick={() => props.onTicket(s.id)}>
              <Pill className={cx('map-strip-chip', `tone-${s.tone}`)}>
                {s.key} {WORD[s.tone]}
              </Pill>
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="link" onClick={props.onFullMap}>
        Full map
      </button>
    </div>
  );
}
