import type { AgentContext } from './agentContext';
import { defaultWaitSeconds } from './hitl';
import { nextTicket } from './ticketOps';
import type { WaitControl } from './types';
import { workSignal, type WorkWake } from './workSignal';

/** How long next_ticket waits by default, and at most: well inside a client's usual ten-minute request timeout. */
const WORK_WAIT_DEFAULT_SECONDS = 120;
const WORK_WAIT_MAX_SECONDS = 600;

/**
 * Between changes, how often the wait checks again anyway: what no file says (a lease running out, an approval
 * where the folder can't be watched). A GitHub or Linear tracker changes far away, so it is asked more often.
 */
const RECHECK_MS = { local: 15_000, tracker: 5_000 };
const PROGRESS_MS = 15_000;

type PickInput = NonNullable<Parameters<typeof nextTicket>[1]>;
type Next = Awaited<ReturnType<typeof nextTicket>>;
type NextInput = PickInput & { wait?: boolean; waitSeconds?: number };

/** How the wait ended, said with the result. */
type Woke = 'ready' | 'work' | 'timeout' | 'cancelled' | 'nothing-open';

const AGAIN =
  'Nothing became claimable. Call next_ticket with wait=true again to keep waiting, or end if the trail is done.';
const NOTHING_OPEN = 'Every ticket on this trail is closed: there is nothing to wait for.';

/**
 * `next_ticket`, and with `wait`, until something on the trail becomes claimable for this agent or `waitSeconds`
 * pass. It wakes on the changes that can free work (a ticket unblocked or released, criteria confirmed, a brief
 * accepted, a reroute decided, the review limit freed, checks on main settled, a trail started anyway past repo
 * readiness: workSignal.ts) and re-checks on a
 * timer besides. Waiting claims nothing and holds nothing: the agent claims what it is offered, as after any
 * next_ticket. A waiting call is a call in progress, so an HTTP session isn't closed as idle meanwhile
 * (createMcpHttp.ts), and progress every 15 s keeps clients that reset their timeout on it waiting.
 */
export async function nextTicketWaiting(ctx: AgentContext, input: NextInput = {}, ctl: WaitControl = {}) {
  const { wait, waitSeconds, ...pick } = input;
  const first = await nextTicket(ctx, pick);
  if (!wait) return first;
  if (first.ticket) return withWait(first, { woke: 'ready', seconds: 0 });
  if (await nothingOpen(ctx, pick.trail)) return withWait(first, { woke: 'nothing-open', seconds: 0 });
  const seconds = Math.min(
    waitSeconds ?? Math.min(WORK_WAIT_DEFAULT_SECONDS, defaultWaitSeconds(ctx)),
    WORK_WAIT_MAX_SECONDS,
  );
  return waitLoop(ctx, { pick, first, seconds, ctl });
}

async function waitLoop(ctx: AgentContext, w: { pick: PickInput; first: Next; seconds: number; ctl: WaitControl }) {
  const started = Date.now();
  const deadline = started + w.seconds * 1000;
  const waited = () => Math.round((Date.now() - started) / 1000);
  const recheck = ctx.opts.tracker ? RECHECK_MS.tracker : RECHECK_MS.local;
  const signal = workSignal(ctx);
  const tick = setInterval(() => {
    ctx.heartbeat();
    w.ctl.onProgress?.(waited());
  }, PROGRESS_MS);
  let last = w.first;
  try {
    for (;;) {
      const left = deadline - Date.now();
      if (left <= 0) return withWait(last, { woke: 'timeout', seconds: waited() });
      const wake = await signal.next(Math.min(left, recheck), w.ctl.signal);
      if (wake.kind === 'cancelled') return withWait(last, { woke: 'cancelled', seconds: waited() });
      last = await nextTicket(ctx, w.pick);
      if (last.ticket) return withWait(last, { woke: 'work', seconds: waited(), because: becauseOf(wake) });
    }
  } finally {
    clearInterval(tick);
    signal.close();
  }
}

const becauseOf = (wake: WorkWake) => (wake.kind === 'changed' ? wake.what : 'found on a re-check');

/** The trail has no open ticket: nothing an agent waits for can come of it (charting more is the agent's own work). */
async function nothingOpen(ctx: AgentContext, trail?: string) {
  const snap = await ctx.resolveTrail(trail);
  return snap.map.archived || !snap.tickets.some((t) => t.state === 'open');
}

function withWait(result: Next, w: { woke: Woke; seconds: number; because?: string }) {
  const next = noteFor(w.woke);
  const because = w.because ? { because: w.because } : {};
  return { ...result, waited: { seconds: w.seconds, woke: w.woke, ...because, ...(next ? { next } : {}) } };
}

function noteFor(woke: Woke): string | undefined {
  switch (woke) {
    case 'timeout':
      return AGAIN;
    case 'nothing-open':
      return NOTHING_OPEN;
    case 'ready':
    case 'work':
    case 'cancelled':
      return undefined;
    default: {
      const never: never = woke;
      return never;
    }
  }
}
