import type { AttentionItem } from '@teamtrail/core';
import { Button } from '../../components/ui';
import { PlanApproval, useBrief, usePlanApproval } from '../discovery';
import { NeedRow } from './NeedRow';
import type { NeedContext } from './types';

/**
 * A submitted brief whose tickets carry criteria is one item: Approve the plan, the brief and every ticket's
 * criteria shown in place and approved in one step, bound to what is shown. Otherwise the brief as any item.
 */
export function PlanNeedRow(props: { item: AttentionItem; ctx: NeedContext; open: boolean; onToggle: () => void }) {
  const { item, ctx } = props;
  const snap = ctx.api.allSnaps[item.mapId];
  const brief = useBrief(snap);
  const plan = usePlanApproval({ snap, brief: brief.brief, hash: brief.hash });
  if (!plan.available || !snap) return <NeedRow {...props} />;
  const here = item.mapId === ctx.api.mapId;
  const title = here ? 'Approve the plan' : `Approve the plan for ${snap.map.title}`;
  return (
    <NeedRow
      {...props}
      text={{ chip: 'Plan', title, quick: 'Approve' }}
      body={
        <PlanApproval plan={plan} withBrief>
          <Button onClick={() => ctx.handlers.openBrief(item.mapId)}>Review it first</Button>
        </PlanApproval>
      }
    />
  );
}
