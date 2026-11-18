import { IMPLEMENTATION_TYPES } from '@teamtrail/core';
import { DetailSection } from '../../components/ui';
import { CriteriaSummary } from '../criteria';
import type { TicketView } from './useTicketView';

/**
 * What "done" means: the ticket's acceptance criteria. Shown when it has some or an agent proposes some, and on an
 * open implementation ticket, where having none yet is the point. Research, junctions and reviews have none.
 */
export function CriteriaSection({ v }: { v: TicketView }) {
  const c = v.criteria;
  const expected = IMPLEMENTATION_TYPES.includes(v.t.type) && v.t.state === 'open';
  if (!c.criteria.length && !c.proposal && !expected) return null;
  return (
    <DetailSection label="Acceptance criteria" className="ticket-criteria">
      <CriteriaSummary c={c} />
    </DetailSection>
  );
}
