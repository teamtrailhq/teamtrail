import { Button, MetaLine } from '../../components/ui';
import { useNow } from '../../hooks/useNow';
import { mainChecksText } from './mainChecksText';
import { useMainChecks } from './useMainChecks';

/**
 * Settings → Verification, checks on main: where they stand for the trail on screen and "Run checks on main", the
 * approved checks on the default branch's head, so a failure already there is known before agents are blamed for it.
 */
export function MainChecksSetting(props: { mapId: string }) {
  const m = useMainChecks(props.mapId);
  const now = useNow(30_000);
  const view = m.view;
  if (!view) return null;
  const text = mainChecksText(view, now);
  const off = view.state.kind === 'off';
  return (
    <div className="main-checks-setting">
      <span className="set-field-label">Checks on main</span>
      <p className="t-body">{text.title}</p>
      <MetaLine parts={text.context} />
      <div className="actions">
        <Button size="sm" disabled={off || m.busy || view.state.kind === 'running'} onClick={() => void m.run()}>
          Run checks on main
        </Button>
      </div>
      {m.error && <p className="vf-err">{m.error}</p>}
      <span className="set-hint t-meta">
        Before agents build, the approved checks run once on the default branch, in a worktree next to the repo. A check
        that already fails there is yours to decide on: fix main first, drop it for the trail, or start anyway.
      </span>
    </div>
  );
}
