import { DetailSection } from '../../components/ui';
import { HowEditor } from './HowEditor';
import { HowFacts } from './HowFacts';
import type { ReasonRequest } from './useTicketActions';
import type { TicketView } from './useTicketView';

/**
 * How the work is done and checked: the guides it takes on, the checks a completion must pass, and the knowledge
 * an agent gets. Read-only; "Edit" (or the action bar's menu) opens the guides and the level for this ticket.
 */
export function HowSection(props: {
  v: TicketView;
  editing: boolean;
  setEditing: (editing: boolean) => void;
  act: (req: ReasonRequest) => Promise<unknown>;
}) {
  const { v } = props;
  const editing = props.editing && v.t.state === 'open';
  const onEdit = v.t.state === 'open' ? () => props.setEditing(!editing) : undefined;
  return (
    <DetailSection label="How" className="ticket-how" onEdit={onEdit} editLabel={editing ? 'Done' : 'Edit'}>
      {editing ? <HowEditor v={v} act={props.act} /> : <HowFacts v={v} />}
    </DetailSection>
  );
}
