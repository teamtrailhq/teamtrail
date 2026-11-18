import type { TrackerAdapter } from '../../adapters/adapter';
import type { VerificationLevel } from '../../model/lifecycle';
import { trailTextProblem } from '../../model/trailTextProblem';
import {
  type TicketType,
  type MapMode,
  type MapSections,
  type MapDoc,
  type Ticket,
  DEFAULT_MAP_MODE,
} from '../../model/types';
import { OperationError } from './operationError';

export interface ChartPlanTicket {
  /** Local reference used to wire blocking before real ids exist. */
  ref: string;
  title: string;
  type: TicketType;
  hitl?: boolean;
  body: string;
  blockedBy?: string[];
}

export interface ChartPlan {
  title: string;
  mode?: MapMode;
  /** Level for the new trail; unset means off. */
  verification?: VerificationLevel;
  sections: MapSections;
  tickets: ChartPlanTicket[];
}

export interface ChartHooks {
  onMapCreated?(map: MapDoc): void | Promise<void>;
  onTicketCreated?(t: Ticket, ref: string): void | Promise<void>;
  onEdgeWired?(blocker: Ticket, blocked: Ticket): void | Promise<void>;
}

/** Create map, then create all tickets, then wire blocking (in that order, as trackers need ids first). */
export async function chartMap(adapter: TrackerAdapter, input: ChartPlan, hooks: ChartHooks = {}) {
  const { destination, notes, assumptions } = input.sections;
  const tooLong = trailTextProblem({ destination, notes, assumptions: assumptions?.map((a) => a.text) });
  if (tooLong) throw new OperationError(tooLong);
  const plan = withMode(input, input.mode ?? DEFAULT_MAP_MODE);
  const map = await adapter.createMap({
    title: plan.title,
    mode: plan.mode,
    sections: plan.sections,
    ...(plan.verification ? { verification: plan.verification } : {}),
  });
  await hooks.onMapCreated?.(map);
  const byRef = new Map<string, Ticket>();
  for (const pt of plan.tickets) {
    const t = await adapter.createTicket(map.id, {
      title: pt.title,
      type: pt.type,
      hitl: pt.hitl,
      body: `${pt.body}\n\nPart of trail ${map.key}.`,
    });
    byRef.set(pt.ref, t);
    await hooks.onTicketCreated?.(t, pt.ref);
  }
  for (const pt of plan.tickets) {
    for (const b of pt.blockedBy ?? []) {
      const blocker = byRef.get(b);
      const blocked = byRef.get(pt.ref)!;
      if (!blocker) continue;
      await adapter.addBlocking(map.id, blocker.id, blocked.id);
      await hooks.onEdgeWired?.(blocker, blocked);
    }
  }
  return { map, tickets: [...byRef.values()] };
}

/** Drop execute tickets from a plan-only chart, re-pointing their dependants at their blockers. */
function withMode(plan: ChartPlan, mode: MapMode): ChartPlan & { mode: MapMode } {
  if (mode === 'plan+execute') return { ...plan, mode };
  const dropped = new Map(plan.tickets.filter((t) => t.type === 'execute').map((t) => [t.ref, t.blockedBy ?? []]));
  const expand = (refs: string[]): string[] => refs.flatMap((r) => (dropped.has(r) ? expand(dropped.get(r)!) : [r]));
  return {
    ...plan,
    mode,
    tickets: plan.tickets
      .filter((t) => !dropped.has(t.ref))
      .map((t) => ({ ...t, blockedBy: [...new Set(expand(t.blockedBy ?? []))] })),
  };
}
