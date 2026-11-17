import { MetaLine } from '../../components/ui';
import { CriteriaList } from './CriteriaList';
import type { TicketCriteria } from './useTicketCriteria';

/**
 * What "done" means for the ticket, read-only: its criteria and whether the trail lead confirmed them, an agent's
 * proposed change, and the business rules no criterion covers yet. Confirming and taking a proposal are in the
 * inspector's action bar.
 */
export function CriteriaSummary({ c }: { c: TicketCriteria }) {
  const { criteria, proposal, uncovered } = c;
  if (!criteria.length && !uncovered.length && !proposal) return null;
  const heading = criteria.length ? `Acceptance criteria · ${criteria.length}` : 'No acceptance criteria yet';
  return (
    <div className="criteria-section">
      <MetaLine parts={[{ text: heading, strong: true }, c.confirmed && 'confirmed by you']} />
      {criteria.length > 0 && <CriteriaList criteria={criteria} />}
      {proposal && (
        <div className="crit-proposal">
          <MetaLine parts={[`${proposal.by} proposes new criteria`, 'yours stay in force until you take these']} />
          <CriteriaList criteria={proposal.criteria} />
        </div>
      )}
      {uncovered.length > 0 && (
        <MetaLine parts={[`No criterion covers ${uncovered.map((r) => `${r.title} (${r.id})`).join(', ')} yet`]} />
      )}
    </div>
  );
}
