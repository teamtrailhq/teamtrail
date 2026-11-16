import { MetaLine } from '../../components/ui';
import { hhmm } from '../../lib';
import { ChecklistAnswers } from './ChecklistAnswers';
import { useChecklist } from './useChecklist';

/** The latest checklist answers the agent gave when it completed the ticket, one list per guide. */
export function ChecklistPanel(props: { mapId: string; ticketId: string }) {
  const rec = useChecklist(props.mapId, props.ticketId);
  if (!rec) return null;
  return (
    <>
      {rec.guides.map((g) => {
        const open = g.answers.filter((a) => !a.done).length;
        return (
          <div key={g.guide.id} className="checklist-panel">
            <MetaLine
              parts={[
                `${g.guide.id} ${g.guide.version} checklist`,
                rec.by,
                hhmm(rec.at),
                open ? `${open} not done` : 'all done',
              ]}
            />
            <ChecklistAnswers answers={g.answers} />
          </div>
        );
      })}
    </>
  );
}
