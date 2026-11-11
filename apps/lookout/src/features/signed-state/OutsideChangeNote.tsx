import { MetaLine, Row } from '../../components/ui';
import { useSignedState } from './useSignedState';

type Kind = 'ticket' | 'decision';

/** What the note says about a change, per kind: a ticket is held, a decision reads as it was signed. */
const HOLD: Record<Kind, string> = {
  ticket: 'held until you accept or revert it',
  decision: 'what you see is what was signed here, until you accept or revert it',
};

/** The changed fields in words: a reworded decision, a ticket or decision nobody signed. */
function fieldsText(fields: string[]) {
  if (fields[0] === 'added') return 'added outside Teamtrail';
  return fields.map((f) => (f === 'words' ? 'its words' : f)).join(', ');
}

/**
 * In the ticket inspector and a decision's detail: its file was edited outside Teamtrail. A change to what gates
 * read (a ticket's state, type, claim, blockers, level; a decision's author or words) waits for the human until
 * they accept or revert it; a text edit is only noted.
 */
export function OutsideChangeNote({ mapId, kind, id }: { mapId: string; kind: Kind; id: string }) {
  const view = useSignedState();
  const same = (i: { mapId: string; kind: string; id: string }) => i.mapId === mapId && i.kind === kind && i.id === id;
  const change = view?.changes.find(same);
  if (change)
    return (
      <Row
        className="d-section"
        edge="attention"
        title="Changed outside Teamtrail"
        context={<MetaLine parts={[`${fieldsText(change.fields)} · ${HOLD[kind]}`]} />}
        detail="By a teammate or an agent editing the file. Settings → Approvals shows what changed."
      />
    );
  if (!view?.textEdits.some(same)) return null;
  return <MetaLine className="d-section" parts={['Text edited outside Teamtrail']} />;
}
