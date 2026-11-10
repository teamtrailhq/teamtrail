import { Button, MetaLine, Row } from '../../components/ui';
import type { OldQueue } from './useApprovals';

/** Tracker writes an earlier version queued in the repo: nothing sends them until the trail lead says so. */
export function OldQueueRow(props: {
  queue: OldQueue;
  busy: boolean;
  local: boolean;
  onDecide: (send: boolean) => void;
}) {
  const { queue } = props;
  return (
    <Row
      as="li"
      className="ap-row"
      edge="attention"
      title={`${queue.writes} tracker writes queued before the upgrade`}
      context={<MetaLine parts={[`For ${queue.targets.join(', ')}`]} />}
      below={
        <div className="ap-below">
          <pre className="ap-lines t-code">{queue.labels.join('\n')}</pre>
          <p className="ap-note t-meta">
            An older version kept this queue in the repo, where anyone who could write it could add to it. Send them
            only if you recognise them; nothing is sent until you do.
          </p>
          {props.local && (
            <div className="ap-actions">
              <Button size="sm" disabled={props.busy} onClick={() => props.onDecide(true)}>
                Send them
              </Button>
              <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onDecide(false)}>
                Discard
              </Button>
            </div>
          )}
        </div>
      }
    />
  );
}
