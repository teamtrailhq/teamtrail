import type { ReactNode } from 'react';
import { Button, ChangedNotice, MetaLine } from '../../components/ui';
import { CriteriaList } from '../criteria';
import { BriefBody } from './BriefBody';
import type { PlanApprovalApi } from './usePlanApproval';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * The plan to approve in one step: (with `withBrief`) the brief, then each ticket's acceptance criteria, and Approve
 * the plan. Everything it approves is on the page; `children` go next to the button (Review it first, Open ticket).
 */
export function PlanApproval(props: {
  plan: PlanApprovalApi;
  withBrief?: boolean;
  onApproved?: () => void;
  children?: ReactNode;
}) {
  const { plan } = props;
  const without = plan.without.map((t) => t.key).join(', ');
  return (
    <div className="plan-approval">
      <p className="t-body">
        The brief and {plural(plan.tickets.length, 'ticket')} with their acceptance criteria. Agents start once you
        approve; you won't be asked about these criteria again.
      </p>
      <div className="plan-approval-items">
        {props.withBrief && plan.brief && <BriefBody brief={plan.brief} />}
        {plan.tickets.map((t) => (
          <section key={t.ticketId} className="plan-approval-ticket">
            <h3 className="t-row-title">
              <span className="t-code">{t.key}</span> {t.title}
            </h3>
            <CriteriaList criteria={t.criteria} />
          </section>
        ))}
      </div>
      {without && <MetaLine parts={[`${without}: no criteria yet, their agent writes them before it starts`]} />}
      {plan.changed && <ChangedNotice what="The plan" onReviewAgain={plan.reviewAgain} />}
      {plan.error && <p className="urgent-text">{plan.error}</p>}
      <div className="plan-approval-actions">
        <Button
          variant="primary"
          disabled={plan.changed || plan.busy}
          onClick={() => void plan.approve().then((ok) => ok && props.onApproved?.())}
        >
          Approve the plan
        </Button>
        {props.children}
      </div>
    </div>
  );
}
