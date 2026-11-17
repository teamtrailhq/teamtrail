import { readMainChecks } from '../mainChecks/readMainChecks';
import type { MainRunEnv } from '../mainChecks/startMainRun';
import { activeTrails } from '../model/activeTrails';
import { BRAND } from '../model/brand';
import type { RouteContext } from './routeContext';

/** What a page shows of checks on main: each active trail's state and the run it reads. */
const signature = (views: Awaited<ReturnType<typeof readMainChecks>>[]) =>
  JSON.stringify(views.map((v) => [v.mapId, v.state, v.run?.id, v.run?.result, v.choices]));

/**
 * Every `pollMs` (default 5 s): starts the run on main a trail ready for work has none of yet (its brief accepted, or
 * discovery skipped), and sends a `main-checks` event when any trail's checks on main changed, a run finishing
 * included. Runs only the approved checks (mainChecks/mainChecksPlan.ts).
 */
export function watchMainChecks(
  ctx: RouteContext & { env: MainRunEnv },
  send: (text: string) => void,
  opts: { pollMs?: number } = {},
): () => void {
  let last = '';
  let busy = false;
  const tick = async () => {
    const maps = activeTrails(await (await ctx.active()).listMaps());
    const views = [];
    for (const m of maps) views.push(await readMainChecks(ctx.env, m.id, { trigger: BRAND.name }));
    const sig = signature(views);
    if (sig === last) return;
    last = sig;
    send('event: main-checks\ndata: {}\n\n');
  };
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    void tick()
      .catch(() => {})
      .finally(() => (busy = false));
  }, opts.pollMs ?? 5000);
  timer.unref?.();
  return () => clearInterval(timer);
}
