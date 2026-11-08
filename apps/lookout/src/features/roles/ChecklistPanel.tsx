import { MetaLine } from '../../components/ui';
import { hhmm } from '../../lib';
import { ChecklistAnswers } from './ChecklistAnswers';
import { useChecklist } from './useChecklist';

/** The latest checklist answers the agent gave when it completed the ticket in its role. */
export function ChecklistPanel(props: { mapId: string; ticketId: string }) {
  const rec = useChecklist(props.mapId, props.ticketId);
  if (!rec) return null;
  const open = rec.answers.filter((a) => !a.done).length;
  return (
    <div className="checklist-panel">
      <MetaLine
        parts={[
          `${rec.role.id} ${rec.role.version} checklist`,
          rec.by,
          hhmm(rec.at),
          open ? `${open} not done` : 'all done',
        ]}
      />
      <ChecklistAnswers answers={rec.answers} />
    </div>
  );
}
