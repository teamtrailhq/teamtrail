import type { CheckWaiver } from '@teamtrail/core';
import { Button, Fact, MetaLine } from '../../components/ui';

/**
 * The checks the trail lead accepted the ticket without, who did and why, with Undo: they run again on the next
 * completion, and a ticket that closed on them goes back in the queue.
 */
export function WaivedChecks(props: { waivers: CheckWaiver[]; onUndo: () => void }) {
  if (!props.waivers.length) return null;
  return (
    <Fact label="Skipped">
      {props.waivers.map((w) => (
        <MetaLine key={w.id} parts={[{ text: w.checks.map((c) => c.name).join(', '), code: true }, w.by, w.reason]} />
      ))}
      <Button size="sm" variant="ghost" data-tip="The checks run again on the next completion" onClick={props.onUndo}>
        Undo
      </Button>
    </Fact>
  );
}
