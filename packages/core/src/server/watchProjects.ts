import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProjectsView } from '../model/project';

/**
 * The `projects` SSE event. Rides on the Lookout's one `/events` stream (home or `/p/<id>/events`), so the
 * overview never needs a connection of its own. While a Lookout listens and more than one project is
 * known, summaries are recomputed every `pollMs` from files, and sent when they changed.
 */
export function watchProjects(input: {
  view: () => Promise<ProjectsView>;
  /** Polls only while this holds (more than the home project). */
  active: () => boolean;
  pollMs?: number;
}) {
  const clients = new Set<ServerResponse>();
  let last = '';
  let busy = false;
  const send = (text: string) => {
    for (const c of clients) if (c.headersSent && !c.writableEnded) c.write(text);
  };
  const tick = async (force = false) => {
    if (busy || !clients.size || !(force || input.active())) return;
    busy = true;
    try {
      const view = await input.view();
      const sig = JSON.stringify(view);
      if (sig === last) return;
      last = sig;
      send(`event: projects\ndata: ${sig}\n\n`);
    } catch {
      // a project that can't be read shows on the next tick; the stream stays up
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), input.pollMs ?? 5000);
  timer.unref?.();
  return {
    listen(req: IncomingMessage, res: ServerResponse) {
      clients.add(res);
      req.on('close', () => clients.delete(res));
    },
    /** Something changed here (a project added or removed, an answer): send the new view now. */
    refresh: () => void tick(true),
    stop() {
      clearInterval(timer);
      clients.clear();
    },
  };
}
