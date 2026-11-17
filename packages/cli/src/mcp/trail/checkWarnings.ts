import type { MapSnapshot, Ticket } from '@teamtrail/core';
import { levelFor, localRepoFiles, repoRootOf, screenConfig } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

/**
 * What reading the repo says about the checks this ticket's completion will run (screenChecks.ts in core), as lines
 * for the claiming agent: a check that can't pass as the repo is would bounce its work until it ran out of attempts.
 * Read-only; only the human changes or waives checks. None for a remote agent, whose work isn't in this checkout.
 */
export async function checkWarnings(ctx: AgentContext, snap: MapSnapshot, t: Ticket): Promise<string[]> {
  if (ctx.remote) return [];
  const { info, config } = levelFor(ctx.root, snap, t);
  if (info.level === 'off') return [];
  const files = localRepoFiles(repoRootOf(ctx.verifyEnv()));
  const findings = await screenConfig({ config: config.config, files, names: info.checks });
  return findings.map(
    (f) =>
      `${f.check}: ${f.text}${f.severity === 'unsure' ? ' (it may still run)' : ''}. If it can't pass, tell the human; only they can change or waive checks.`,
  );
}
