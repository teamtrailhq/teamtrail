import { OperationError, repoPaths, type MapSnapshot, type Ticket } from '@teamtrail/core';
import { CHECK_RUNNER, collectEvidence, levelFor, readVerificationConfig, repoRootOf } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

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

/** What git saw change since the claim, for a close with no verification; `error` when it could not be read. */
export interface SeenChanges {
  changed: string[];
  error?: string;
}

/**
 * A local close with no verification (a research or junction ticket, or verification off) has no attempt and so no
 * git evidence on record. Teamtrail still reads the files changed since the claim: the risk policy is judged on them
 * as well as on what the agent declared, before any answer of the human's is matched to the call. Remote agents'
 * files are not here, and verified closes keep their evidence on the attempt.
 */
export async function changedSinceClaim(ctx: AgentContext, snap: MapSnapshot, ticket: Ticket): Promise<SeenChanges> {
  if (ctx.remote || !ticket.assignee || levelFor(ctx.root, snap, ticket).info.level !== 'off') return { changed: [] };
  const config = readVerificationConfig(ctx.root);
  try {
    const ev = await collectEvidence({
      root: ctx.root,
      cwd: repoRootOf(ctx.verifyEnv()),
      snap,
      ticket,
      config: config.config,
      configHash: config.hash,
    });
    return { changed: ev.changed.map((f) => f.path) };
  } catch (e) {
    return { changed: [], error: (e as Error).message };
  }
}

/**
 * Says out loud what a close without verification can't hide: files changed while closing a no-code ticket, or that
 * Teamtrail could not read what changed. On the ticket (for the human) and in the result (for the agent).
 */
export async function flagUnverified(ctx: AgentContext, at: { snap: MapSnapshot; ticket: Ticket; seen: SeenChanges }) {
  const { ticket: t, seen } = at;
  const warning = seen.error ? unreadLine(t, seen.error) : changedLine(t, seen.changed);
  if (!warning) return undefined;
  const heading = seen.error
    ? '**Closed without verification; changes unknown**'
    : '**Closed without verification, with changes**';
  await ctx.adapter.comment(at.snap.map.id, t.id, CHECK_RUNNER, `${heading}\n\n${warning}`);
  return warning;
}

const unreadLine = (t: Ticket, error: string) =>
  `${t.key} closed without verification, and Teamtrail could not read the files changed since the claim (${error}). Review what changed yourself.`;

function changedLine(t: Ticket, changed: string[]) {
  if (!changed.length) return undefined;
  const listed = changed.slice(0, 10).join(', ') + (changed.length > 10 ? ` and ${changed.length - 10} more` : '');
  const files = `${changed.length} file${changed.length === 1 ? '' : 's'}`;
  return `${t.key} is a ${t.type} ticket closed without verification, yet ${files} changed since the claim: ${listed}. Code changes belong on an implementation ticket, where they are checked.`;
}
