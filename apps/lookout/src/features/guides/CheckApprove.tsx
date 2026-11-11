import { checkNotice, type ProposedCheck } from '@teamtrail/core';
import { Button } from '../../components/ui';

/**
 * The Approve button of one proposed check. A program Teamtrail doesn't know says so first, in full, and its button
 * names the acknowledgement: approving it says the person knows what it runs.
 */
export function CheckApprove(props: {
  name: string;
  spec: ProposedCheck;
  busy?: boolean;
  onApprove: (name: string, acknowledged: boolean) => void;
}) {
  const notice = checkNotice(props.spec);
  if (!notice)
    return (
      <Button size="sm" disabled={props.busy} onClick={() => props.onApprove(props.name, false)}>
        Approve check {props.name}
      </Button>
    );
  return (
    <span className="guide-unknown">
      <span className="t-body">
        Unknown program: Teamtrail can't tell what this runs. Approve it only if you know what it does.
      </span>
      <Button size="sm" disabled={props.busy} onClick={() => props.onApprove(props.name, true)}>
        I know what it runs: approve check {props.name}
      </Button>
    </span>
  );
}
