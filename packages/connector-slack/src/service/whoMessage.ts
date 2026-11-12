import { label, md } from '../blocks';
import { ago } from './ago';
import type { SlackContext } from './slackContext';
import { trailWorld } from './trailWorld';

/**
 * `@Scout who`: the agents working now, each with its trail, the ticket it claimed, its step and whether it waits
 * on you. Read-only.
 */
export async function whoMessage(ctx: SlackContext) {
  const w = await trailWorld(ctx);
  const running = w.docs.filter((d) => d.session.status === 'running');
  if (!running.length) return { text: 'No agents are working right now.' };
  const maps = new Map(w.snaps.map((s) => [s.map.id, s]));
  const lines = running.map((d) => {
    const s = d.session;
    const snap = maps.get(s.mapId);
    const ticket = snap?.tickets.find((t) => t.id === s.ticketId);
    const parts = [
      `*${label(s.agent)}*`,
      ...(ticket ? [`${label(ticket.key)} ${label(ticket.title)}`] : []),
      ...(snap ? [label(snap.map.title)] : []),
      `${label(s.stepLabel)} ${s.step}/${s.total}`,
      d.pending.length || s.waitingOn ? 'waiting on you' : `for ${ago(s.startedAt, w.now)}`,
    ];
    return parts.join(' · ');
  });
  return {
    text: `${running.length} agent${running.length > 1 ? 's' : ''} working`,
    blocks: [{ type: 'section', text: md(lines.slice(0, 15).join('\n')) }],
  };
}
