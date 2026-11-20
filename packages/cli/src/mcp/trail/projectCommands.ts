import { pathsIn, staleAnchors, type Ticket } from '@teamtrail/core';
import {
  blobHash,
  listKnowledge,
  localRepoFiles,
  repoRootFor,
  repoRootOf,
  trustedChecks,
} from '@teamtrail/core/agents';
import { checkEnv, claimCommands, detectRepoProfile, storedCheckEnvNames } from '@teamtrail/core/node';
import type { AgentContext } from './agentContext';

/**
 * `commands` on a claim: per package the work touches (its `touches`, paths the ticket names), how to install, build,
 * test and run it from the note the trail lead confirmed, the setup and checks Teamtrail runs for it, and what its
 * tests need (claimCommands.ts in core). Read from this machine's checkout; nothing without one. A remote agent gets
 * them too, without `passedToChecks`: its checks don't run with this machine's environment. `passedToChecks` counts
 * the names added in Settings → Project → Check variables on this machine (storedCheckEnvNames.ts in core).
 */
export async function projectCommands(ctx: AgentContext, t: Ticket, touches: string[] = []) {
  const files = localRepoFiles(repoRootOf(ctx.verifyEnv()));
  if (!files) return {};
  const profile = await detectRepoProfile(files);
  if (!profile.units.length) return {};
  const repo = repoRootFor(ctx.root);
  const env = checkEnv(process.env, storedCheckEnvNames(ctx.root)).env;
  const commands = claimCommands({
    profile,
    notes: listKnowledge(ctx.root),
    config: trustedChecks(ctx.root).config.config,
    paths: [...touches, ...pathsIn(t.body)],
    ...(ctx.remote ? {} : { passed: (name: string) => env[name] !== undefined }),
    staleOf: (e) => staleAnchors(e, (p) => blobHash(repo, p)),
  });
  return commands.length ? { commands } : {};
}
