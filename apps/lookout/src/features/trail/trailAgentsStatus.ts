import type { TrailAgents } from '../../lib/trailAgents';

/** What the agents are doing, in a few words. */
export function trailAgentsStatus(s: TrailAgents) {
  if (s.running) return `Agents · ${s.running} working`;
  return s.note ? `Agents · ${s.note}` : 'Agents · starting soon';
}
