import {
  OperationError,
  type MapSnapshot,
  type RuleAnswer,
  type Ticket,
  type VerificationConfig,
} from '@teamtrail/core';
import { collectEvidence, repoRootOf, trustedChecks } from '@teamtrail/core/agents';
import { rulesForTouches, rulesGate, type UnansweredRule } from '@teamtrail/core/node';
import type { AgentContext } from './agentContext';

/** The rules of the verification.json approved on this machine: what an agent writes in the repo adds or drops none. */
const approvedConfig = (ctx: AgentContext): VerificationConfig | undefined => trustedChecks(ctx.root).config.config;

/** What git saw change since the claim, here; a remote agent's files are the ones it named. */
async function changedFiles(ctx: AgentContext, at: { snap: MapSnapshot; ticket: Ticket; declared: string[] }) {
  if (ctx.remote) return at.declared;
  const ev = await collectEvidence({
    root: ctx.root,
    cwd: repoRootOf(ctx.verifyEnv()),
    snap: at.snap,
    ticket: at.ticket,
  }).catch(() => undefined);
  return ev?.changed.map((f) => f.path) ?? [];
}

const ruleText = (r: UnansweredRule) => `${r.id} asks: ${r.ask} (why: ${r.why}; for ${r.files.slice(0, 5).join(', ')})`;

/**
 * The `diff-rules` gate before a verified completion goes through: every approved rule whose files the change touched
 * and that asks a question needs its answer in `ruleAnswers`. Under enforce, a completion missing one is refused with
 * the list (nothing moves; the agent answers and completes again, or the trail lead lets the ticket go without a rule
 * in the Lookout); under observe it is journaled and goes through.
 */
export async function assertRulesAnswered(
  ctx: AgentContext,
  at: { snap: MapSnapshot; ticket: Ticket; declared: string[]; answers?: RuleAnswer[]; agent: string },
) {
  const config = approvedConfig(ctx);
  if (!config?.rules.length) return;
  const files = await changedFiles(ctx, at);
  const gate = rulesGate({
    root: ctx.root,
    mapId: at.snap.map.id,
    ticket: at.ticket,
    config,
    files,
    answers: at.answers,
    agent: at.agent,
  });
  if (!gate.held) return;
  ctx.activity.push({
    source: 'system',
    level: 'warn',
    kind: 'asks-you',
    text: `${at.ticket.key} held: ${gate.unanswered.map((r) => r.id).join(', ')} unanswered`,
    ticketId: at.ticket.id,
  });
  throw new OperationError(
    `${at.ticket.key} isn't complete yet: this change matched diff rules whose questions need your answer. ${gate.unanswered.map(ruleText).join(' ')} Answer each in ruleAnswers ([{ rule, answer }]) and complete again. Only the human can let the ticket go without one, in the Lookout.`,
  );
}

/**
 * The approved rules a claim will likely meet, from the files the agent said it would change, so it plans for their
 * checks and questions. Without touches, how many rules there are and how to see which apply.
 */
export function rulesAtClaim(ctx: AgentContext, touches: string[] | undefined) {
  const rules = approvedConfig(ctx)?.rules ?? [];
  if (!rules.length) return {};
  if (!touches?.length)
    return {
      rulesNote: `This project has ${rules.length} diff rule${rules.length === 1 ? '' : 's'}: checks that run, or questions you answer in ruleAnswers, when your change touches certain files. Claim with touches to see which apply.`,
    };
  const likely = rulesForTouches(rules, touches);
  if (!likely.length) return {};
  return {
    rules: likely.map(({ rule, touches: hit }) => ({
      id: rule.id,
      when: rule.when,
      ...(rule.check ? { check: rule.check } : {}),
      ...(rule.ask ? { ask: rule.ask } : {}),
      why: rule.why,
      touches: hit,
    })),
    rulesNote:
      'These rules likely apply to your change. A rule with a check runs it on your completion; one that asks needs your answer in ruleAnswers when you complete.',
  };
}
