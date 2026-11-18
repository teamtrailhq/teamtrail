import { MetaLine } from '../../components/ui';
import { CriteriaList } from './CriteriaList';
import { UncoveredRules } from './UncoveredRules';
import type { TicketCriteria } from './useTicketCriteria';

/**
 * What "done" means for the ticket, read-only, under its Acceptance criteria label: the criteria and whether the
 * trail lead confirmed them, an agent's proposed change, and the business rules no criterion covers yet. Confirming
 * and taking a proposal are in the ticket's actions.
 */
export function CriteriaSummary({ c }: { c: TicketCriteria }) {
  const { criteria, proposal, uncovered } = c;
  const confirmed = c.confirmed ? 'confirmed by you' : 'not confirmed yet';
  return (
    <div className="criteria-section">
      {criteria.length > 0 ? (
        <>
          <MetaLine parts={[`${criteria.length} ${criteria.length === 1 ? 'criterion' : 'criteria'}`, confirmed]} />
          <CriteriaList criteria={criteria} />
        </>
      ) : (
        <MetaLine parts={['None yet']} />
      )}
      {proposal && (
        <div className="crit-proposal">
          <MetaLine parts={[`${proposal.by} proposes new criteria`, 'yours stay in force until you take these']} />
          <CriteriaList criteria={proposal.criteria} />
        </div>
      )}
      <UncoveredRules rules={uncovered} />
    </div>
  );
}
