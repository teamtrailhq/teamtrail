import { MetaLine } from '../../components/ui';
import { FixArea } from './FixArea';
import { trailLine } from './readinessText';
import { StartButton } from './StartButton';
import { useReadiness } from './useReadiness';

/**
 * The readiness item opened in Needs you: what blocks first and its evidence, its one-click fix when it has one,
 * Start anyway for the trail on screen (or its undo), and Details for the whole screen.
 */
export function ReadinessNeed(props: { mapId?: string; now: number; onDetails: () => void }) {
  const r = useReadiness();
  const view = r.view;
  if (!view) return null;
  const blocking = view.readiness.findings.filter((f) => f.level === 'blocks');
  const first = blocking[0];
  const trail = view.trails.find((t) => t.mapId === props.mapId);
  const more = blocking.length - 1;
  return (
    <div className="rd-need">
      {first && <MetaLine parts={[first.why, more > 0 ? `and ${more} more` : '']} />}
      {trail && <MetaLine parts={[trailLine(trail, props.now)]} />}
      {first && <FixArea finding={first} busy={r.busy} primary onFix={(f, ack) => void r.fix(f, ack)} />}
      <div className="home-need-links">
        {trail && <StartButton trail={trail} busy={r.busy} onStart={(id, undo) => void r.startAnyway(id, undo)} />}
        <button type="button" className="link" onClick={props.onDetails}>
          Details
        </button>
      </div>
      {r.error && <p className="vf-err">{r.error}</p>}
    </div>
  );
}
