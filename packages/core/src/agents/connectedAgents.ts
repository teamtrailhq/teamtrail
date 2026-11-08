import { processAlive } from '../lib/processAlive';
import { UNKNOWN_MODEL_TIER } from '../model/modelTier';
import type { ConnectedAgent } from '../planning/matching/modelWaits';
import type { AgentSessionDoc } from './agentLink';

/**
 * Agents whose MCP process is still running, one per trail name, with the tier of the model their latest session
 * ran on (balanced when it reported none). An agent between tickets counts: its process is alive.
 */
export function connectedAgents(docs: AgentSessionDoc[]): ConnectedAgent[] {
  const latest = new Map<string, AgentSessionDoc>();
  for (const d of docs) {
    if (!processAlive(d.pid)) continue;
    const prev = latest.get(d.session.agent);
    if (!prev || d.session.startedAt > prev.session.startedAt) latest.set(d.session.agent, d);
  }
  return [...latest.values()]
    .map((d) => ({
      agent: d.session.agent,
      tier: d.session.tier ?? UNKNOWN_MODEL_TIER,
      ...(d.session.model ? { model: d.session.model } : {}),
    }))
    .sort((a, b) => a.agent.localeCompare(b.agent));
}
