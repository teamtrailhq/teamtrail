import { MetaLine, Row } from '../../components/ui';
import { sinceLabel } from '../../lib/sinceLabel';
import type { WaivedRule } from './types';
import { UndoRuleWaiver } from './UndoRuleWaiver';

/** The rules the trail lead let this ticket go without: who, when and why, each with Undo. */
export function WaivedRules(props: { mapId: string; ticketId: string; waived: WaivedRule[]; onUndone: () => void }) {
  if (!props.waived.length) return null;
  return (
    <ul className="dr-list dr-waived">
      {props.waived.map((w) => (
        <Row
          as="li"
          key={w.rule}
          title={`Went without ${w.rule}`}
          context={<MetaLine parts={[w.by, sinceLabel(w.at)]} />}
          detail={w.reason}
          actions={
            <UndoRuleWaiver mapId={props.mapId} ticketId={props.ticketId} rule={w.rule} onDone={props.onUndone} />
          }
        />
      ))}
    </ul>
  );
}
