import { BRAND } from './brand';
import { compareVersions } from './compareVersions';

/**
 * What to say when an agent's Teamtrail and the Lookout's differ, or nothing when they match or either is unknown.
 * `agent` is the agent's trail name, when known.
 */
export function versionSkew(v: { agentVersion?: string; lookoutVersion?: string; agent?: string }): string | undefined {
  const { agentVersion, lookoutVersion } = v;
  if (!agentVersion || !lookoutVersion || compareVersions(agentVersion, lookoutVersion) === 0) return undefined;
  const who = v.agent ? `${v.agent} runs` : 'This agent runs';
  const both = `${who} ${BRAND.name} ${agentVersion}, the Lookout ${lookoutVersion}`;
  if (compareVersions(agentVersion, lookoutVersion) < 0)
    return `${both}: run \`${BRAND.slug} connect\` again to update the agent, then restart it.`;
  return `${both}: update ${BRAND.slug} where the Lookout runs and restart it; until then its answers can't approve anything.`;
}
