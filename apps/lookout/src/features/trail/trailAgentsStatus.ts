import type { TrailAgents } from '../../lib/trailAgents';

/** What the agents are doing, in a few words, with the model they're on when the server says. */
export function trailAgentsStatus(s: TrailAgents) {
  if (s.running) return s.model ? `Agents · ${s.running} working · ${s.model}` : `Agents · ${s.running} working`;
  return s.note ? `Agents · ${s.note}` : 'Agents · starting soon';
}
