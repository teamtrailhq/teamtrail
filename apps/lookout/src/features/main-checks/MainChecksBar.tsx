import { Button, MoreMenu } from '../../components/ui';
import type { MainChecksActions } from './mainChecksActions';

/** The choices on screen as buttons, the rest and the undos behind "⋯"; an action's error reads under it. */
export function MainChecksBar(props: { actions: MainChecksActions; busy: boolean; error?: string }) {
  const { buttons, menu } = props.actions;
  if (!buttons.length && !menu.length && !props.error) return null;
  return (
    <>
      <div className="actions main-checks-bar">
        {buttons.map((b) => (
          <Button key={b.id} size="sm" data-tip={b.tip} disabled={props.busy} onClick={b.onSelect}>
            {b.label}
          </Button>
        ))}
        <MoreMenu items={menu} label="More about checks on main" />
      </div>
      {props.error && <p className="vf-err">{props.error}</p>}
    </>
  );
}
