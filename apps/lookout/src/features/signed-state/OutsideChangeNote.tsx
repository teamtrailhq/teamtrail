import { MetaLine, Row } from '../../components/ui';
import { useSignedState } from './useSignedState';

/**
 * In the ticket inspector: this ticket's file was edited outside Teamtrail. A change to what gates read (its state,
 * type, claim, blockers, level) is held for the human until they accept or revert it; a text edit is only noted.
 */
export function OutsideChangeNote({ mapId, ticketId }: { mapId: string; ticketId: string }) {
  const view = useSignedState();
  const same = (i: { mapId: string; kind: string; id: string }) =>
    i.mapId === mapId && i.kind === 'ticket' && i.id === ticketId;
  const change = view?.changes.find(same);
  if (change)
    return (
      <Row
        className="d-section"
        edge="attention"
        title="Changed outside Teamtrail"
        context={<MetaLine parts={[`${change.fields.join(', ')} · held until you accept or revert it`]} />}
        detail="By a teammate or an agent editing the file. Settings → Approvals shows old → new."
      />
    );
  if (!view?.textEdits.some(same)) return null;
  return <MetaLine className="d-section" parts={['Text edited outside Teamtrail']} />;
}
