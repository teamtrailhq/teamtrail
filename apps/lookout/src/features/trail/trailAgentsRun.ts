import { readTrailAgents, setTrailAgents, type TrailAgents } from '../../lib/trailAgents';

/**
 * Between a click and the server saying it happened: `starting` after Start until a run is reported (or the server
 * says why none goes), `stopping` while agents still run after Pause.
 */
export type TrailAgentsPending = 'starting' | 'stopping';

/** What the control shows: the server's state, what is still on its way, a request in flight, and what went wrong. */
export interface TrailAgentsRunView {
  state?: TrailAgents;
  pending?: TrailAgentsPending;
  busy: boolean;
  error?: string;
}

/** How often the server is asked again: often while something is on its way, now and then otherwise. */
export const PENDING_POLL_MS = 2_000;
export const IDLE_POLL_MS = 15_000;
/** How long Starting… and Stopping… wait for the server before saying it is taking long. */
export const PENDING_LIMIT_MS = 120_000;

/** What is on its way, from the server's state and when this page last asked for a start. */
export function pendingOf(state: TrailAgents | undefined, startedAt?: number): TrailAgentsPending | undefined {
  if (!state) return undefined;
  // paused, and the server still reports runs: they are stopping, whoever paused them
  if (!state.on && state.running > 0) return 'stopping';
  // started here, and no run yet nor a word on why none goes
  if (startedAt !== undefined && state.on && state.running === 0 && !state.note) return 'starting';
  return undefined;
}

/** What is said when the server takes longer than PENDING_LIMIT_MS. */
function tooLong(pending: TrailAgentsPending, state: TrailAgents) {
  if (pending === 'stopping')
    return `The agents haven't stopped yet: ${state.running} still running. They stop when their current step ends.`;
  return 'No agent has started yet. Pause and start again, or see Runs for why.';
}

/**
 * This person's agents on one trail, framework-free (useTrailAgents.ts wraps it): reads the server now and then, acts
 * on Start and Pause, and holds Starting… and Stopping… until the server reports the run began or ended.
 */
export function trailAgentsRun(o: { mapId: string; onChange: (view: TrailAgentsRunView) => void; now?: () => number }) {
  const now = o.now ?? Date.now;
  let view: TrailAgentsRunView = { busy: false };
  let startedAt: number | undefined;
  /** When the current pending began, for PENDING_LIMIT_MS. */
  let since: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let live = true;
  /** Bumped by each Start or Pause: a read sent before one says nothing about it. */
  let acted = 0;

  const set = (next: Partial<TrailAgentsRunView>) => {
    view = { ...view, ...next };
    if (live) o.onChange(view);
  };
  const schedule = () => {
    clearTimeout(timer);
    if (live) timer = setTimeout(() => void load(), view.pending ? PENDING_POLL_MS : IDLE_POLL_MS);
  };
  /** The server's state taken in: what is still on its way, and whether it is taking long. */
  const take = (state: TrailAgents) => {
    const pending = pendingOf(state, startedAt);
    if (pending !== 'starting') startedAt = undefined;
    if (!pending) since = undefined;
    else since ??= now();
    const late = pending && since !== undefined && now() - since > PENDING_LIMIT_MS;
    set({ state, pending, error: late ? tooLong(pending, state) : undefined });
  };
  const load = async () => {
    const asked = acted;
    const state = await readTrailAgents(o.mapId);
    if (!live || asked !== acted) return;
    if (state) take(state);
    else if (view.pending)
      set({
        error: `Couldn't reach the server to see whether the agents ${view.pending === 'stopping' ? 'stopped' : 'started'}. Trying again.`,
      });
    schedule();
  };
  const act = async (on: boolean, repo?: string) => {
    acted++;
    set({ busy: true, error: undefined });
    const next = await setTrailAgents(o.mapId, { on, ...(on && repo ? { repo } : {}) });
    if (!live) return false;
    if ('error' in next) {
      set({ busy: false, error: next.error });
      return false;
    }
    startedAt = on ? now() : undefined;
    since = undefined;
    set({ busy: false });
    take(next);
    schedule();
    return on;
  };
  void load();
  return {
    view: () => view,
    act,
    dispose: () => {
      live = false;
      clearTimeout(timer);
    },
  };
}
