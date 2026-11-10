import type { SlackStatus } from '@teamtrail/connector-slack';
import { BRAND } from '@teamtrail/core';

/** Why the earlier version's choice of owner didn't prove anything. */
const HOW: Record<NonNullable<SlackStatus['ownerRedo']>['via'], string> = {
  home: 'was the first to click “This is me” in Slack',
  'git-email': 'has a Slack email that matched your git email',
};

/** After an upgrade: the owner an earlier version chose was dropped, and why the lead sets it again. */
export function OwnerRedo({ redo }: { redo: NonNullable<SlackStatus['ownerRedo']> }) {
  const who = redo.was.name ? `@${redo.was.name}` : redo.was.id;
  return (
    <p className="sl-redo">
      Set your Slack owner again. An earlier version of {BRAND.name} made {who} the owner because that account{' '}
      {HOW[redo.via]}. Anyone in the workspace could have done that, so Scout stopped sending questions and approvals
      there. Get a code below and enter it from your own Slack account.
    </p>
  );
}
