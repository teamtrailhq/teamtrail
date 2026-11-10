import { OperationError, repoPaths, type MapSnapshot, type Ticket } from '@teamtrail/core';
import { CHECK_RUNNER, collectEvidence, readVerificationConfig, repoRootOf } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { checkRisk } from './riskCheck';

/**
 * The files a completion says it changed, repo-relative. A remote agent's completion of verified work has nothing
 * else: no git here sees its checkout. So it must name them (or say why none changed), and the human is shown
 * them as its word.
 */
export function declaredPaths(at: { remote: boolean; verified: boolean; paths?: string[]; noCodeReason?: string }) {
  const paths = repoPaths(at.paths);
  if (at.remote && at.verified && !paths.length && !at.noCodeReason?.trim())
    throw new OperationError(
      "Over a remote connection Teamtrail can't see your changes: pass paths with the files you changed (or noCodeReason when none had to), so the human sees what to review.",
    );
  return paths;
}

/**
 * A local close with no verification (a research or junction ticket, or verification off) has no attempt and so
 * no git evidence on record. Teamtrail still reads the files changed since the claim: the risk policy is judged on
 * them as well as on what the agent declared, and changing files while closing a no-code ticket is said out loud.
 */
export async function unverifiedChanges(
  ctx: AgentContext,
  at: { snap: MapSnapshot; ticket: Ticket; declared: string[]; decidedBy: string },
): Promise<{ changed: string[]; warning?: string }> {
  if (ctx.remote) return { changed: [] };
  const config = readVerificationConfig(ctx.root);
  const ev = await collectEvidence({
    root: ctx.root,
    cwd: repoRootOf(ctx.verifyEnv()),
    snap: at.snap,
    ticket: at.ticket,
    config: config.config,
    configHash: config.hash,
  }).catch(() => undefined);
  const changed = (ev?.changed ?? []).map((f) => f.path);
  if (!changed.length) return { changed };
  checkRisk({ root: ctx.root, paths: [...new Set([...at.declared, ...changed])], decidedBy: at.decidedBy });
  const listed = changed.slice(0, 10).join(', ') + (changed.length > 10 ? ` and ${changed.length - 10} more` : '');
  const warning = `${at.ticket.key} is a ${at.ticket.type} ticket closed without verification, yet ${changed.length} file${changed.length === 1 ? '' : 's'} changed since the claim: ${listed}. Code changes belong on an implementation ticket, where they are checked.`;
  await ctx.adapter.comment(
    at.snap.map.id,
    at.ticket.id,
    CHECK_RUNNER,
    `**Closed without verification, with changes**\n\n${warning}`,
  );
  return { changed, warning };
}
