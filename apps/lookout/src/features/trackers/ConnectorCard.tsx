import type { RemoteKind, TrackerSettings } from '@teamtrail/core';
import type { TrackerChoice } from '../../lib';
import { ConnectorActions } from './ConnectorActions';
import { ConnectorWhere } from './ConnectorWhere';
import { isRemote } from './labels';
import { SyncLine } from './SyncLine';

/** One tracker card in Settings: where it points, its sync state, and Switch / Connect / Edit. */
export function ConnectorCard(props: {
  id: TrackerChoice;
  name: string;
  active: boolean;
  configured: boolean;
  open: boolean;
  location: string;
  s?: TrackerSettings | null;
  onSwitch: () => void;
  onToggle: () => void;
}) {
  const { id, active, configured, s } = props;
  const remote = isRemote(id);
  const usable = !remote || !!s;
  const classes = ['card connector', active ? 'active' : '', usable ? '' : 'disabled', props.open ? 'open' : ''];
  return (
    <div className={classes.join(' ')}>
      <div className="card-row">
        <b className="choice-title t-row-title">{props.name}</b>
        {active && <span className="pill on">Active</span>}
      </div>
      <ConnectorWhere id={id} active={active} configured={configured} location={props.location} s={s} />
      {remote && active && <SyncLine status={s?.[id as RemoteKind].status} />}
      <ConnectorActions
        canSwitch={!active && (!remote || configured)}
        remote={remote}
        usable={usable}
        configured={configured}
        open={props.open}
        onSwitch={props.onSwitch}
        onToggle={props.onToggle}
      />
    </div>
  );
}
