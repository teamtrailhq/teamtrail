import { Disclosure, Fact, MetaLine } from '../../components/ui';
import { hhmm } from '../../lib';
import { ChecklistAnswers } from './ChecklistAnswers';
import { useChecklist } from './useChecklist';

/**
 * The agent's latest checklist answers as a fact in the inspector's Progress, one count per guide ("qa 5/5 ·
 * security 4/4"), with each guide's answers behind Details. Nothing until it gave some.
 */
export function ChecklistSummary(props: { mapId: string; ticketId: string }) {
  const rec = useChecklist(props.mapId, props.ticketId);
  if (!rec) return null;
  const counts = rec.guides.map((g) => `${g.guide.id} ${g.answers.filter((a) => a.done).length}/${g.answers.length}`);
  return (
    <Fact label="Checklists">
      <span className="t-body">{counts.join(' · ')}</span>
      <Disclosure>
        {rec.guides.map((g) => (
          <div key={g.guide.id} className="checklist-panel">
            <MetaLine parts={[`${g.guide.id} ${g.guide.version}`, rec.by, hhmm(rec.at)]} />
            <ChecklistAnswers answers={g.answers} />
          </div>
        ))}
      </Disclosure>
    </Fact>
  );
}
