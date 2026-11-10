import type { PendingTracker } from '@teamtrail/core';
import { Button, MetaLine, Row } from '../../components/ui';

/** trackers.json names another tracker than the one this machine uses: switch to it, or keep the current one. */
export function TrackerChangeRow(props: {
  tracker: PendingTracker;
  busy: boolean;
  local: boolean;
  onDecide: (use: boolean) => void;
}) {
  const { tracker } = props;
  return (
    <Row
      as="li"
      className="ap-row"
      edge="attention"
      title={`trackers.json now points at ${tracker.label}`}
      context={<MetaLine parts={['Nothing is read from or sent there yet']} />}
      detail={`This machine keeps using ${tracker.approved}`}
      below={
        props.local && (
          <div className="ap-below ap-actions">
            <Button size="sm" disabled={props.busy} onClick={() => props.onDecide(true)}>
              Use {tracker.label}
            </Button>
            <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onDecide(false)}>
              Keep {tracker.approved}
            </Button>
          </div>
        )
      }
    />
  );
}
