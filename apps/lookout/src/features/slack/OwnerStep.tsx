import type { SlackStatus } from '@teamtrail/connector-slack';
import { OwnerCode } from './OwnerCode';
import { OwnerConfirm } from './OwnerConfirm';
import { OwnerRedo } from './OwnerRedo';

/**
 * Setup step 5: the trail lead gets a code here, an account enters it in Slack, and the lead confirms that account
 * here. Nothing else puts an account forward.
 */
export function OwnerStep(props: { s: SlackStatus; set: (s: SlackStatus) => void }) {
  const { s, set } = props;
  if (s.pendingOwner) return <OwnerConfirm s={s} who={s.pendingOwner} set={set} />;
  return (
    <>
      {s.ownerRedo && <OwnerRedo redo={s.ownerRedo} />}
      <OwnerCode s={s} set={set} />
    </>
  );
}
