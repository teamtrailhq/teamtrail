import type { SlackStatus } from '@teamtrail/connector-slack';
import { OwnerCode } from './OwnerCode';
import { OwnerConfirm } from './OwnerConfirm';

/** Setup step 5: a Slack account is put forward (by the code, or by the git email) and confirmed here. */
export function OwnerStep(props: { s: SlackStatus; set: (s: SlackStatus) => void }) {
  const { s, set } = props;
  if (s.pendingOwner) return <OwnerConfirm who={s.pendingOwner} set={set} />;
  return <OwnerCode s={s} set={set} />;
}
