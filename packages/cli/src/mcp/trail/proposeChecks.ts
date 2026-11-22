import { OperationError, parseVerificationConfig } from '@teamtrail/core';
import { checksApproval } from '@teamtrail/core/agents';
import {
  commandLine,
  detectRepoProfile,
  proposedChecksText,
  proposeRefusal,
  proposeSetupChecks,
  type ProposedSetupCheck,
} from '@teamtrail/core/node';
import type { AgentContext } from './agentContext';
import { readinessHostOf } from './readinessGate';

const NOTE =
  'Proposed, not approved: no check runs until the trail lead approves them in the Lookout (Settings → Approvals). ' +
  'When the setup work is done, call close_ticket: it waits for the approval, then runs them on this work.';

/** The programs the proposed checks start that the machine running checks doesn't have (an embedding server's probe). */
async function unavailable(ctx: AgentContext, text: string): Promise<string[]> {
  const host = readinessHostOf(ctx);
  const files = host.files();
  if (typeof host.probe !== 'function' || !files) return [];
  const config = parseVerificationConfig(text).config;
  const probes = await host.probe({ profile: await detectRepoProfile(files), config, files }).catch(() => undefined);
  const programs = Object.entries(probes?.programs ?? {});
  return programs.filter(([, p]) => !p.path).map(([name]) => `${name}: not available where the checks run`);
}

/**
 * `propose_checks`: the setup ticket's agent (model/setupTicket.ts) proposes the checks the trail is verified with,
 * for agents whose files aren't on this machine too. Each check is argv only and passes the check lint; the file is
 * written as a proposal and journaled. Nothing runs until the trail lead approves it.
 */
export async function proposeChecks(
  ctx: AgentContext,
  input: { trail?: string; ticket?: string; checks: ProposedSetupCheck[] },
) {
  const running = ctx.sessions.running();
  const snap = await ctx.resolveTrail(input.trail ?? (running?.info.mapId || undefined));
  const ref = input.ticket ?? (running?.info.mapId === snap.map.id ? running.info.ticketId : undefined);
  if (!ref) throw new OperationError('Which ticket? Pass `ticket`: the setup ticket you claimed.');
  const t = ctx.findTicket(snap, ref);
  const agent = await ctx.agentId();
  const approval = checksApproval(ctx.root);
  const kept = approval.approved?.content;
  const approved = kept ? parseVerificationConfig(kept).config : undefined;
  const refused = proposeRefusal({ ticket: t, agent, approved });
  if (refused) throw new OperationError(refused);
  const made = proposedChecksText({ current: approval.text, checks: input.checks });
  if ('refused' in made) throw new OperationError(made.refused);
  const names = input.checks.map((c) => c.name);
  proposeSetupChecks({ root: ctx.root, mapId: snap.map.id, ticketId: t.id, by: agent, text: made.text, names });
  ctx.activity.push({
    source: 'system',
    level: 'warn',
    kind: 'asks-you',
    text: `${t.key} proposes checks: approve them in Settings → Approvals`,
  });
  const missing = await unavailable(ctx, made.text);
  return {
    ticket: t.key,
    proposed: input.checks.map((c) => `${c.name}: ${commandLine(c.run)}${c.cwd ? ` (in ${c.cwd})` : ''}`),
    ...(missing.length ? { unavailable: missing } : {}),
    note: NOTE,
  };
}
