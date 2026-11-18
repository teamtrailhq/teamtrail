import type { MainRunEnv } from '../mainChecks/startMainRun';
import { activeTrails } from '../model/activeTrails';
import { BRAND } from '../model/brand';
import type { TrailChecksView } from '../model/trailChecks';
import { readTrailChecks } from '../trailChecks/readTrailChecks';
import type { RouteContext } from './routeContext';

/** What a page shows of the trails' combined runs: each trail's state and the run it reads. */
const signature = (views: TrailChecksView[]) =>
  JSON.stringify(views.map((v) => [v.mapId, v.state, v.run?.id, v.run?.result, v.merges]));

/**
 * Every `pollMs` (default 10 s): starts the combined run on main for a trail whose every ticket is done and merged
 * and that has no run for exactly those merges yet, and sends a `trail-checks` event when any trail's changed, a run
 * finishing included. Runs only the approved checks (mainChecks/mainChecksPlan.ts).
 */
export function watchTrailChecks(
  ctx: RouteContext & { env: MainRunEnv },
  send: (text: string) => void,
  opts: { pollMs?: number } = {},
): () => void {
  let last = '';
  let busy = false;
  const tick = async () => {
    const adapter = await ctx.active();
    const views: TrailChecksView[] = [];
    for (const m of activeTrails(await adapter.listMaps()))
      views.push(await readTrailChecks(ctx.env, await adapter.loadMap(m.id), { trigger: BRAND.name }));
    const sig = signature(views);
    if (sig === last) return;
    last = sig;
    send('event: trail-checks\ndata: {}\n\n');
  };
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    void tick()
      .catch(() => {})
      .finally(() => (busy = false));
  }, opts.pollMs ?? 10_000);
  timer.unref?.();
  return () => clearInterval(timer);
}
