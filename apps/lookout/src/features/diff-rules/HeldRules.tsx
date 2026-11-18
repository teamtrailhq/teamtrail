import { DetailSection } from '../../components/ui';
import { HeldRuleList } from './HeldRuleList';
import { useHeldRules } from './useHeldRules';
import { WaivedRules } from './WaivedRules';

/**
 * A ticket's diff rules in the full ticket: the questions its latest completion was refused for, each with Go without
 * (the agent answers and completes again, or the ticket completes without that answer), and the rules the trail lead
 * let it go without, each with Undo. Shown only while there is one of either.
 */
export function HeldRules(props: { mapId: string; ticketId: string }) {
  const { held, waived, reload } = useHeldRules(props.mapId, props.ticketId);
  const holding = held && held.rules.length > 0;
  if (!holding && !waived.length) return null;
  return (
    <DetailSection label="Diff rules" className="dr-rules">
      {holding && <HeldRuleList mapId={props.mapId} ticketId={props.ticketId} held={held} onWaived={reload} />}
      <WaivedRules mapId={props.mapId} ticketId={props.ticketId} waived={waived} onUndone={reload} />
    </DetailSection>
  );
}
