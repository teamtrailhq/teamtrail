import { BRAND, compareVersions, versionSkew } from '@teamtrail/core';
import { readAgentDocs } from '@teamtrail/core/agents';

/**
 * What the Lookout says on start about connected agents on another Teamtrail version: `connect` pins an agent to
 * the version that ran it, so after an update the agents keep the old one until connected again. Answers still
 * reach them, but an agent from before answer labels can't tell what this Lookout's answers may approve.
 */
export async function agentVersionWarnings(root: string, own: string | undefined): Promise<string[]> {
  if (!own) return [];
  const running = (await readAgentDocs(root)).filter((d) => d.session.status === 'running');
  return running.flatMap((d) => {
    const agent = d.session.agent;
    if (!d.teamtrail)
      return [
        `${agent} runs an older ${BRAND.name} than this Lookout (${own}): run \`${BRAND.slug} connect\` again to update the agent, then restart it.`,
      ];
    if (compareVersions(d.teamtrail, own) === 0) return [];
    return [versionSkew({ agentVersion: d.teamtrail, lookoutVersion: own, agent })!];
  });
}
