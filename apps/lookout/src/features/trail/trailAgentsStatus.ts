import type { TrailAgents } from '../../lib/trailAgents';
import type { TrailAgentsPending } from './trailAgentsRun';

/** What the agents are doing, in a few words, with the model they're on when the server says. */
export function trailAgentsStatus(s: TrailAgents, pending?: TrailAgentsPending) {
  if (pending === 'stopping') return `Agents · stopping, ${s.running} still working`;
  if (pending === 'starting') return 'Agents · starting…';
  if (s.running) return s.model ? `Agents · ${s.running} working · ${s.model}` : `Agents · ${s.running} working`;
  return s.note ? `Agents · ${s.note}` : 'Agents · starting soon';
}
