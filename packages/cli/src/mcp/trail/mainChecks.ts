import { mainChecksHeld, OperationError, type MainChecksView, type MapSnapshot, type Ticket } from '@teamtrail/core';
import { readMainChecks, repoRootOf } from '@teamtrail/core/agents';
import { setupMergeReason, setupNotOnMain } from '@teamtrail/core/node';
import type { AgentContext } from './agentContext';
import { mainChecksReason } from './mainChecksReason';

/** How long a call waits for a run on main it starts, or finds going: a quick one answers the same call. */
const WAIT_MS = 20_000;

/**
 * Checks on main for one trail as a claim sees them: the view, the ready tickets it holds back, and why, said to the
 * agent (with the Lookout item that settles it when main fails).
 */
export interface MainGate {
  view: MainChecksView;
  held: Ticket[];
  reason?: string;
  lookoutItem?: string;
}

/**
 * Checks on main for `snap`'s trail. Asking starts the run a trail ready for work has none of yet, waiting a little
 * for it: an agent's claim is one of the moments a trail starts building. In Cloud the server's runner runs it.
 */
export async function mainGate(ctx: AgentContext, snap: MapSnapshot): Promise<MainGate> {
  const runner = ctx.opts.checkRunner;
  const env = { root: ctx.root, repoRoot: repoRootOf(ctx.verifyEnv()), ...(runner ? { checkRunner: runner } : {}) };
  const trigger = `agent ${await ctx.agentId()}`;
  const view = await readMainChecks(env, snap.map.id, { trigger, waitMs: WAIT_MS });
  const held = mainChecksHeld(snap, view);
  // the setup work of a new repo not merged yet: main has no project, so that merge is all it waits on
  const setup = view.holds ? setupNotOnMain({ root: ctx.root, snap }) : undefined;
  if (setup) return { view, held, reason: setupMergeReason(setup) };
  return { view, held, ...mainChecksReason(view) };
}

/** Refuses an explicit claim of new implementation work while checks on main hold it. Own claims go on. */
export function assertMainChecks(gate: MainGate, t: Ticket, agent: string) {
  if (t.assignee === agent || !gate.reason) return;
  if (gate.held.some((h) => h.id === t.id)) throw new OperationError(gate.reason);
}

const ALREADY =
  "Already failing on main: don't chase these. A completion that fails only in them, the same way, isn't sent back; its proof says so.";

/**
 * What an agent learns about checks on main on next, claim and resume: why work waits, or which checks already fail
 * on main (known failures) and which the trail lead dropped for this trail. Nothing while they simply passed.
 */
export function mainChecksField(gate: MainGate) {
  const { view } = gate;
  const known = view.choices.known.map((k) => k.name);
  const dropped = view.choices.dropped.map((d) => d.name);
  const wait = view.holds && gate.reason ? { waits: gate.reason } : {};
  const failing = view.state.kind === 'accepted' ? view.state.known : [];
  const already = [...new Set([...known, ...failing])];
  if (!wait.waits && !already.length && !dropped.length) return {};
  return {
    mainChecks: {
      ...wait,
      ...(wait.waits && gate.lookoutItem ? { lookoutItem: gate.lookoutItem } : {}),
      ...(already.length ? { knownFailures: already, note: ALREADY } : {}),
      ...(dropped.length ? { droppedForThisTrail: dropped } : {}),
      ...(view.run?.commit ? { commit: view.run.commit.slice(0, 12) } : {}),
    },
  };
}
